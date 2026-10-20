// Утилита «Установка драйвера принтера» для Xprinter / 4BARCODE / Xlife.
//
// 1. Находит принтер по USB: Windows создаёт узел USBPRINT\<MFG><MDL><4 hex> сразу при
//    подключении, даже без драйвера (см. tools/printer_ids.tsv).
// 2. По MFG выбирает пак драйверов и скачивает свежий установщик из облака Mail.ru.
// 3. Seagull (Xprinter, 4BARCODE): распаковка «<exe> /x <папка>» без мастера, затем
//    pnputil /add-driver <inf> /install — Windows сама привязывает драйвер к принтеру
//    и создаёт очередь печати. Xlife: запускает его собственный мастер установки.
//
// Сборка: tools/setup/build.cmd (csc из .NET Framework 4.x, C# 5).
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Management;
using System.Net;
using System.Reflection;
using System.Security.Cryptography.X509Certificates;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;

[assembly: AssemblyTitle("Установка драйвера принтера")]
[assembly: AssemblyProduct("Xprinter · Поддержка")]
[assembly: AssemblyDescription("Находит принтер Xprinter, 4BARCODE или Xlife по USB и устанавливает драйвер")]
[assembly: AssemblyCompany("Xprinter · Поддержка")]
[assembly: AssemblyCopyright("xprinter.shop")]
[assembly: AssemblyVersion("1.0.0.0")]
[assembly: AssemblyFileVersion("1.0.0.0")]

namespace XprinterSetup
{
    class Pack
    {
        public string Id, Title, Folder, FilePattern;
        public bool Seagull;
    }

    class Found
    {
        public string HardwareId, DeviceName, Brand, Model, Slug;
        public Pack Pack;
        public bool DriverOk;
        public string Queue;

        public string Title
        {
            get { return Slug != null ? Catalog.Names[Slug] : (Brand + " " + Model); }
        }
    }

    static class Catalog
    {
        // Адрес сайта поддержки: ссылки «Страница модели» и «Поддержка».
        public const string Site = "https://xprinters.github.io/";
        public const string Telegram = "https://t.me/xprintershop";

        // Папки облака и шаблон имени установщика: берётся самый свежий подходящий файл,
        // поэтому новую версию драйвера достаточно положить в ту же папку.
        public static readonly Dictionary<string, Pack> Packs = new Dictionary<string, Pack>
        {
            { "XPRINTER", new Pack { Id = "xprinter", Title = "Xprinter", Seagull = true,
                Folder = "Kfzk/HHA7de4t3/Драйвер/Windows/Windows 7-11", FilePattern = @"^Xprinter_[\d.]+\.exe$" } },
            { "4BARCODE", new Pack { Id = "4barcode", Title = "4BARCODE", Seagull = true,
                Folder = "BEjx/hMrCkaHEW/ДРАЙВЕР/Windows/Для этикеток", FilePattern = @"^4BARCODE_[\d.]+\.exe$" } },
            { "XLIFE", new Pack { Id = "xlife", Title = "Xlife", Seagull = false,
                Folder = "MEL2/yj2suHKu5/Windows", FilePattern = @"^Xlife\.driver\.[\d.]+\.exe$" } },
        };

        // MFG + MDL из Hardware ID (без 4 hex контрольной суммы) -> модель сайта
        public static readonly Dictionary<string, string> Models = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            { "XprinterXP-365B", "xp-365b" }, { "4BARCODE3B-365B", "xp-365b" },
            { "4BARCODE4B-2083B", "v1bt" }, { "XprinterXP-D362B", "v1bt" },
            { "4BARCODE3B-T371U", "v2" }, { "4BARCODE3B-Q371U", "v2" },
            { "XprinterXP-T371U", "v2" }, { "XprinterXP-Q371U", "v2" },
            { "4BARCODE3B-Q361U", "v3" }, { "XprinterXP-Q361U", "v3" },
            { "4BARCODE4B-2064C", "v4" },
            { "4BARCODE4B-2054N", "mini" }, { "XprinterXP-D465B", "mini" },
            { "XprinterXP-P322B", "pocket" },
            { "XlifeP83", "a4pro" }, { "XlifeP83C", "a4pro" }, { "XlifeP84", "a4pro" },
        };

        public static readonly Dictionary<string, string> Names = new Dictionary<string, string>
        {
            { "xp-365b", "Xprinter XP-365B" }, { "v1bt", "Xprinter V1BT" }, { "v2", "Xprinter V2" },
            { "v3", "Xprinter V3" }, { "v4", "Xprinter V4" }, { "mini", "Xprinter Mini" },
            { "pocket", "Xprinter Pocket" }, { "a4pro", "A4PRO / A4 Tattoo" },
        };
    }

    static class Log
    {
        public static readonly string Dir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "XprinterSetup");
        static readonly object Sync = new object();

        public static void Write(string line)
        {
            try
            {
                lock (Sync)
                {
                    Directory.CreateDirectory(Dir);
                    File.AppendAllText(Path.Combine(Dir, "log.txt"),
                        DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + "  " + line + Environment.NewLine, Encoding.UTF8);
                }
            }
            catch { }
        }
    }

    static class Detector
    {
        static string[] Strings(object o)
        {
            return o as string[] ?? new string[0];
        }

        public static List<Found> Scan()
        {
            var queues = new List<Tuple<string, string, string>>(); // имя, драйвер, порт
            using (var s = new ManagementObjectSearcher("SELECT Name, DriverName, PortName FROM Win32_Printer"))
                foreach (ManagementObject p in s.Get())
                    queues.Add(Tuple.Create((string)p["Name"], (string)p["DriverName"] ?? "", (string)p["PortName"] ?? ""));

            var result = new List<Found>();
            const string q = "SELECT Name, PNPDeviceID, HardwareID, ConfigManagerErrorCode FROM Win32_PnPEntity " +
                             "WHERE PNPDeviceID LIKE 'USBPRINT\\\\%'";
            using (var s = new ManagementObjectSearcher(q))
            {
                foreach (ManagementObject d in s.Get())
                {
                    var hwid = Strings(d["HardwareID"]).FirstOrDefault(h => h.StartsWith("USBPRINT\\", StringComparison.OrdinalIgnoreCase));
                    if (hwid == null) continue;
                    var body = hwid.Substring("USBPRINT\\".Length);
                    if (body.Length > 4) body = body.Substring(0, body.Length - 4); // контрольная сумма
                    string brand = Catalog.Packs.Keys.FirstOrDefault(b => body.StartsWith(b, StringComparison.OrdinalIgnoreCase));
                    Log.Write("USBPRINT: " + hwid + " | " + d["Name"] + " | err=" + d["ConfigManagerErrorCode"]);
                    if (brand == null) continue;

                    var f = new Found
                    {
                        HardwareId = hwid,
                        DeviceName = (string)d["Name"] ?? "",
                        Brand = body.Substring(0, brand.Length),
                        Model = body.Substring(brand.Length),
                        Pack = Catalog.Packs[brand],
                    };
                    string slug;
                    if (Catalog.Models.TryGetValue(body, out slug)) f.Slug = slug;
                    var err = Convert.ToInt32(d["ConfigManagerErrorCode"] ?? 0);
                    var queue = queues.FirstOrDefault(t => t.Item3.StartsWith("USB", StringComparison.OrdinalIgnoreCase) &&
                        string.Equals(t.Item2, f.DeviceName, StringComparison.OrdinalIgnoreCase));
                    f.DriverOk = err == 0 && queue != null;
                    if (queue != null) f.Queue = queue.Item1;
                    result.Add(f);
                }
            }
            return result;
        }
    }

    static class Cloud
    {
        const string Ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) XprinterSetup/1.0";

        static string Escape(string weblink)
        {
            return string.Join("/", weblink.Split('/').Select(Uri.EscapeDataString));
        }

        static WebClient Client()
        {
            var c = new WebClient { Encoding = Encoding.UTF8 };
            c.Headers[HttpRequestHeader.UserAgent] = Ua;
            return c;
        }

        // Имя и weblink самого свежего установщика в папке
        public static Tuple<string, string, long> Latest(Pack pack)
        {
            var json = Client().DownloadString("https://cloud.mail.ru/api/v4/public/list?weblink=" + Escape(pack.Folder));
            var data = new JavaScriptSerializer().Deserialize<Dictionary<string, object>>(json);
            var list = ((System.Collections.ArrayList)data["list"]).Cast<Dictionary<string, object>>();
            var rx = new Regex(pack.FilePattern, RegexOptions.IgnoreCase);
            var file = list
                .Where(i => (string)i["type"] == "file" && rx.IsMatch((string)i["name"]))
                .OrderByDescending(i => (string)i["name"], new VersionAwareComparer())
                .FirstOrDefault();
            if (file == null) throw new Exception("в облаке нет установщика " + pack.Title);
            return Tuple.Create((string)file["name"], (string)file["weblink"], Convert.ToInt64(file["size"]));
        }

        public static async Task Download(string weblink, string path, long size, Action<long, long> progress)
        {
            var disp = new JavaScriptSerializer().Deserialize<Dictionary<string, object>>(
                Client().DownloadString("https://cloud.mail.ru/api/v2/dispatcher"));
            var body = (Dictionary<string, object>)disp["body"];
            var baseUrl = (string)((Dictionary<string, object>)((System.Collections.ArrayList)body["weblink_get"])[0])["url"];
            var tmp = path + ".part";
            using (var c = Client())
            {
                c.DownloadProgressChanged += (s, e) => progress(e.BytesReceived, e.TotalBytesToReceive > 0 ? e.TotalBytesToReceive : size);
                await c.DownloadFileTaskAsync(new Uri(baseUrl + "/" + Escape(weblink)), tmp);
            }
            if (File.Exists(path)) File.Delete(path);
            File.Move(tmp, path);
        }
    }

    // «Xprinter_2024.3.exe» > «Xprinter_11.5.exe»: числа сравниваются как числа
    class VersionAwareComparer : IComparer<string>
    {
        public int Compare(string a, string b)
        {
            var pa = Regex.Split(a, @"(\d+)");
            var pb = Regex.Split(b, @"(\d+)");
            for (int i = 0; i < Math.Min(pa.Length, pb.Length); i++)
            {
                long na, nb;
                int c = long.TryParse(pa[i], out na) && long.TryParse(pb[i], out nb)
                    ? na.CompareTo(nb) : string.Compare(pa[i], pb[i], StringComparison.OrdinalIgnoreCase);
                if (c != 0) return c;
            }
            return pa.Length.CompareTo(pb.Length);
        }
    }

    static class WinTrust
    {
        [System.Runtime.InteropServices.StructLayout(System.Runtime.InteropServices.LayoutKind.Sequential, CharSet = System.Runtime.InteropServices.CharSet.Unicode)]
        class FileInfo
        {
            public int cbStruct = System.Runtime.InteropServices.Marshal.SizeOf(typeof(FileInfo));
            public string pcwszFilePath;
            public IntPtr hFile = IntPtr.Zero;
            public IntPtr pgKnownSubject = IntPtr.Zero;
        }

        [System.Runtime.InteropServices.StructLayout(System.Runtime.InteropServices.LayoutKind.Sequential)]
        class Data
        {
            public int cbStruct = System.Runtime.InteropServices.Marshal.SizeOf(typeof(Data));
            public IntPtr pPolicyCallbackData = IntPtr.Zero;
            public IntPtr pSIPClientData = IntPtr.Zero;
            public int dwUIChoice = 2;            // WTD_UI_NONE
            public int fdwRevocationChecks = 0;   // WTD_REVOKE_NONE
            public int dwUnionChoice = 1;         // WTD_CHOICE_FILE
            public IntPtr pFile;
            public int dwStateAction = 0;
            public IntPtr hWVTStateData = IntPtr.Zero;
            public IntPtr pwszURLReference = IntPtr.Zero;
            public int dwProvFlags = 0x1000;      // WTD_CACHE_ONLY_URL_RETRIEVAL: без сети
            public int dwUIContext = 0;
        }

        [System.Runtime.InteropServices.DllImport("wintrust.dll", CharSet = System.Runtime.InteropServices.CharSet.Unicode)]
        static extern int WinVerifyTrust(IntPtr hwnd, [System.Runtime.InteropServices.MarshalAs(System.Runtime.InteropServices.UnmanagedType.LPStruct)] Guid action, Data data);

        static readonly Guid GenericVerifyV2 = new Guid("00AAC56B-CD44-11d0-8CC2-00C04FC295EE");

        public static int Verify(string path)
        {
            var file = new FileInfo { pcwszFilePath = path };
            var ptr = System.Runtime.InteropServices.Marshal.AllocHGlobal(System.Runtime.InteropServices.Marshal.SizeOf(file));
            try
            {
                System.Runtime.InteropServices.Marshal.StructureToPtr(file, ptr, false);
                return WinVerifyTrust(new IntPtr(-1), GenericVerifyV2, new Data { pFile = ptr });
            }
            finally
            {
                System.Runtime.InteropServices.Marshal.FreeHGlobal(ptr);
            }
        }
    }

    static class Installer
    {
        public static string Run(string exe, string args, int timeoutMs)
        {
            Log.Write("> " + exe + " " + args);
            var psi = new ProcessStartInfo(exe, args)
            {
                UseShellExecute = false, CreateNoWindow = true,
                RedirectStandardOutput = true, RedirectStandardError = true,
            };
            using (var p = Process.Start(psi))
            {
                var output = p.StandardOutput.ReadToEndAsync();
                var error = p.StandardError.ReadToEndAsync();
                if (!p.WaitForExit(timeoutMs)) { try { p.Kill(); } catch { } throw new Exception(Path.GetFileName(exe) + " не завершился вовремя"); }
                var text = output.Result + error.Result;
                Log.Write("exit=" + p.ExitCode + " " + text.Trim());
                return text;
            }
        }

        // Скачанный установщик запускаем только с действительной подписью известного издателя
        static readonly string[] Publishers = { "Seagull Software", "Zhuhai Hena Electronic Technology" };

        public static void VerifySignature(string path)
        {
            X509Certificate2 cert;
            try { cert = new X509Certificate2(X509Certificate.CreateFromSignedFile(path)); }
            catch { throw new Exception("у файла " + Path.GetFileName(path) + " нет цифровой подписи"); }
            // WinVerifyTrust — проверка Authenticode как в Проводнике, с учётом метки времени
            // (сертификат издателя может быть уже просрочен, подпись при этом действительна)
            int trust = WinTrust.Verify(path);
            bool ok = trust == 0 && Publishers.Any(p => cert.Subject.Contains(p));
            Log.Write("signature: " + cert.Subject + " trust=0x" + trust.ToString("X8"));
            if (trust != 0) throw new Exception("цифровая подпись файла " + Path.GetFileName(path) + " недействительна");
            if (!ok) throw new Exception("файл " + Path.GetFileName(path) + " подписан неизвестным издателем");
        }

        // Распаковка пака Seagull и установка драйвера через pnputil
        public static void InstallSeagull(string installer, string outDir)
        {
            if (Directory.Exists(outDir)) Directory.Delete(outDir, true);
            // ExtractEngine принимает путь только без кавычек, поэтому outDir — без пробелов
            using (var p = Process.Start(new ProcessStartInfo(installer, "/x " + outDir) { UseShellExecute = false }))
            {
                Log.Write("> " + installer + " /x " + outDir);
                if (!p.WaitForExit(600000)) throw new Exception("распаковка драйвера не завершилась");
            }
            var inf = Directory.Exists(outDir) ? Directory.GetFiles(outDir, "*.inf").FirstOrDefault() : null;
            if (inf == null) throw new Exception("не удалось распаковать драйвер");

            // Как DriverWizard: издатель Seagull в доверенных, иначе Windows спрашивает подтверждение
            var cer = Path.Combine(outDir, "SeagullPublisher.cer");
            if (File.Exists(cer))
            {
                var store = new X509Store(StoreName.TrustedPublisher, StoreLocation.LocalMachine);
                store.Open(OpenFlags.ReadWrite);
                store.Add(new X509Certificate2(cer));
                store.Close();
            }
            Run(Path.Combine(Environment.SystemDirectory, "pnputil.exe"), "/add-driver \"" + inf + "\" /install", 600000);
        }

        public static void RunVendorSetup(string installer)
        {
            Log.Write("> " + installer);
            using (var p = Process.Start(new ProcessStartInfo(installer) { UseShellExecute = true }))
                p.WaitForExit();
        }
    }

    // ===== Оформление в стиле сайта («Signal Blue Grid», светлая тема) =====
    static class Theme
    {
        public static readonly Color Bg = Color.White;
        public static readonly Color Fg = ColorTranslator.FromHtml("#1f2937");
        public static readonly Color Muted = ColorTranslator.FromHtml("#64748b");
        public static readonly Color Border = ColorTranslator.FromHtml("#e2e8f0");
        public static readonly Color Card = ColorTranslator.FromHtml("#f8fafc");
        public static readonly Color Accent = ColorTranslator.FromHtml("#2563eb");
        public static readonly Color AccentHover = ColorTranslator.FromHtml("#1d4ed8");
        public static readonly Color AccentSoft = ColorTranslator.FromHtml("#eff6ff");
        public static readonly Color Success = ColorTranslator.FromHtml("#15803d");
        public static readonly Color SuccessSoft = ColorTranslator.FromHtml("#f0fdf4");
        public static readonly Color SuccessLine = ColorTranslator.FromHtml("#86efac");
        public static readonly Color Warn = ColorTranslator.FromHtml("#b45309");
        public static readonly Color WarnSoft = ColorTranslator.FromHtml("#fffbeb");
        public static readonly Color WarnLine = ColorTranslator.FromHtml("#fcd34d");
        public static readonly Color Error = ColorTranslator.FromHtml("#b91c1c");
        public static readonly Color ErrorSoft = ColorTranslator.FromHtml("#fef2f2");
        public static readonly Color ErrorLine = ColorTranslator.FromHtml("#fca5a5");

        public static readonly string Ui = Has("Segoe UI Variable Text") ? "Segoe UI Variable Text" : "Segoe UI";
        public static readonly string Mono = Has("JetBrains Mono") ? "JetBrains Mono" : Has("Cascadia Mono") ? "Cascadia Mono" : "Consolas";
        public static readonly string Icons = Has("Segoe Fluent Icons") ? "Segoe Fluent Icons" : "Segoe MDL2 Assets";

        static bool Has(string name)
        {
            return FontFamily.Families.Any(f => f.Name == name);
        }

        public static System.Drawing.Drawing2D.GraphicsPath Round(RectangleF r, float radius)
        {
            var p = new System.Drawing.Drawing2D.GraphicsPath();
            float d = radius * 2;
            p.AddArc(r.X, r.Y, d, d, 180, 90);
            p.AddArc(r.Right - d, r.Y, d, d, 270, 90);
            p.AddArc(r.Right - d, r.Bottom - d, d, d, 0, 90);
            p.AddArc(r.X, r.Bottom - d, d, d, 90, 90);
            p.CloseFigure();
            return p;
        }

        public static void Smooth(Graphics g)
        {
            g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
            g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.ClearTypeGridFit;
        }
    }

    // Базовый «рисованный» элемент: двойная буферизация, прозрачный фон, масштаб по DPI
    class Painted : Control
    {
        public Painted()
        {
            SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer |
                     ControlStyles.ResizeRedraw | ControlStyles.UserPaint | ControlStyles.SupportsTransparentBackColor, true);
            BackColor = Theme.Bg;
        }

        protected float S { get { return DeviceDpi / 96f; } }
    }

    class FlatButton : Painted
    {
        public bool Primary;
        bool hover, down;

        public FlatButton()
        {
            Cursor = Cursors.Hand;
            Font = new Font(Theme.Ui, 10f, FontStyle.Bold);
        }

        protected override void OnMouseEnter(EventArgs e) { hover = true; Invalidate(); base.OnMouseEnter(e); }
        protected override void OnMouseLeave(EventArgs e) { hover = down = false; Invalidate(); base.OnMouseLeave(e); }
        protected override void OnMouseDown(MouseEventArgs e) { down = true; Invalidate(); base.OnMouseDown(e); }
        protected override void OnMouseUp(MouseEventArgs e) { down = false; Invalidate(); base.OnMouseUp(e); }
        protected override void OnEnabledChanged(EventArgs e) { Cursor = Enabled ? Cursors.Hand : Cursors.Default; Invalidate(); base.OnEnabledChanged(e); }
        protected override void OnTextChanged(EventArgs e) { Invalidate(); base.OnTextChanged(e); }

        protected override void OnPaint(PaintEventArgs e)
        {
            var g = e.Graphics;
            Theme.Smooth(g);
            g.Clear(Parent != null ? Parent.BackColor : Theme.Bg);
            var r = new RectangleF(0.5f, 0.5f, Width - 1.5f, Height - 1.5f);
            Color fill, line, text;
            if (Primary)
            {
                fill = !Enabled ? ColorTranslator.FromHtml("#93c5fd") : (hover || down) ? Theme.AccentHover : Theme.Accent;
                line = fill;
                text = Color.White;
            }
            else
            {
                fill = !Enabled ? Theme.Card : (hover || down) ? Theme.AccentSoft : Theme.Bg;
                line = !Enabled ? Theme.Border : hover ? Theme.Accent : ColorTranslator.FromHtml("#cbd5e1");
                text = !Enabled ? ColorTranslator.FromHtml("#94a3b8") : Theme.Accent;
            }
            using (var path = Theme.Round(r, 8 * S))
            using (var b = new SolidBrush(fill))
            using (var p = new Pen(line, 1f))
            {
                g.FillPath(b, path);
                g.DrawPath(p, path);
            }
            TextRenderer.DrawText(g, Text, Font, ClientRectangle, text,
                TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter | TextFormatFlags.SingleLine);
        }
    }

    class SlimProgress : Painted
    {
        int value;
        public bool Indeterminate;
        readonly System.Windows.Forms.Timer anim = new System.Windows.Forms.Timer { Interval = 30 };
        float phase;

        public SlimProgress()
        {
            anim.Tick += (s, e) => { phase = (phase + 0.012f) % 1.4f; Invalidate(); };
        }

        public int Value { get { return value; } set { this.value = Math.Max(0, Math.Min(100, value)); Invalidate(); } }

        protected override void OnVisibleChanged(EventArgs e)
        {
            anim.Enabled = Visible;
            base.OnVisibleChanged(e);
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            var g = e.Graphics;
            Theme.Smooth(g);
            g.Clear(Theme.Bg);
            float h = Height - 1, rad = h / 2;
            using (var track = Theme.Round(new RectangleF(0, 0, Width - 1, h), rad))
            using (var b = new SolidBrush(Theme.Border))
                g.FillPath(b, track);
            float x0, w;
            if (Indeterminate) { x0 = (phase - 0.4f) * (Width - 1); w = 0.4f * (Width - 1); }
            else { x0 = 0; w = (Width - 1) * value / 100f; }
            var clip = new RectangleF(Math.Max(0, x0), 0, Math.Min(Width - 1, x0 + w) - Math.Max(0, x0), h);
            if (clip.Width < h) return;
            using (var bar = Theme.Round(clip, rad))
            using (var b = new SolidBrush(Theme.Accent))
                g.FillPath(b, bar);
        }
    }

    enum NoticeKind { None, Success, Warn, Error }

    // Плашка с результатом, как admonition на сайте
    class Notice : Painted
    {
        public NoticeKind Kind;

        public Notice() { Font = new Font(Theme.Ui, 9.5f); }

        public void Show(NoticeKind kind, string text)
        {
            Kind = kind;
            Text = text;
            Visible = kind != NoticeKind.None;
            Invalidate();
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            var g = e.Graphics;
            Theme.Smooth(g);
            g.Clear(Theme.Bg);
            Color soft, line, ink;
            string glyph;
            switch (Kind)
            {
                case NoticeKind.Success: soft = Theme.SuccessSoft; line = Theme.SuccessLine; ink = Theme.Success; glyph = ""; break;
                case NoticeKind.Warn: soft = Theme.WarnSoft; line = Theme.WarnLine; ink = Theme.Warn; glyph = ""; break;
                default: soft = Theme.ErrorSoft; line = Theme.ErrorLine; ink = Theme.Error; glyph = ""; break;
            }
            var r = new RectangleF(0.5f, 0.5f, Width - 1.5f, Height - 1.5f);
            using (var path = Theme.Round(r, 8 * S))
            using (var b = new SolidBrush(soft))
            using (var p = new Pen(line))
            {
                g.FillPath(b, path);
                g.DrawPath(p, path);
            }
            int pad = (int)(12 * S), icon = (int)(20 * S);
            using (var f = new Font(Theme.Icons, 12f))
                TextRenderer.DrawText(g, glyph, f, new Rectangle(pad, pad, icon, icon), ink,
                    TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter);
            TextRenderer.DrawText(g, Text, Font,
                new Rectangle(pad * 2 + icon - (int)(4 * S), pad, Width - pad * 3 - icon, Height - pad * 2), Theme.Fg,
                TextFormatFlags.WordBreak | TextFormatFlags.Left | TextFormatFlags.Top);
        }
    }

    // Карточка найденного принтера
    class PrinterCard : Painted
    {
        public Found Printer;
        public bool Selected;
        bool hover;

        public PrinterCard(Found f)
        {
            Printer = f;
            Cursor = Cursors.Hand;
        }

        protected override void OnMouseEnter(EventArgs e) { hover = true; Invalidate(); base.OnMouseEnter(e); }
        protected override void OnMouseLeave(EventArgs e) { hover = false; Invalidate(); base.OnMouseLeave(e); }

        protected override void OnPaint(PaintEventArgs e)
        {
            var g = e.Graphics;
            Theme.Smooth(g);
            g.Clear(Theme.Bg);
            var r = new RectangleF(1, 1, Width - 3, Height - 3);
            using (var path = Theme.Round(r, 10 * S))
            using (var b = new SolidBrush(Selected ? Theme.AccentSoft : hover ? Theme.Card : Theme.Bg))
            using (var p = new Pen(Selected ? Theme.Accent : hover ? ColorTranslator.FromHtml("#cbd5e1") : Theme.Border, Selected ? 2f : 1f))
            {
                g.FillPath(b, path);
                g.DrawPath(p, path);
            }

            int pad = (int)(14 * S), tile = Height - pad * 2;
            var tileRect = new RectangleF(pad, pad, tile, tile);
            using (var path = Theme.Round(tileRect, 8 * S))
            using (var b = new SolidBrush(Selected ? Color.White : ColorTranslator.FromHtml("#dbeafe")))
                g.FillPath(b, path);
            using (var f = new Font(Theme.Icons, 16f))
                TextRenderer.DrawText(g, "", f, Rectangle.Round(tileRect), Theme.Accent,
                    TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter);

            // Бейдж статуса справа
            string badge = Printer.DriverOk ? "Драйвер установлен" : "Нужен драйвер";
            Color bFg = Printer.DriverOk ? Theme.Success : Theme.Warn;
            Color bBg = Printer.DriverOk ? ColorTranslator.FromHtml("#dcfce7") : ColorTranslator.FromHtml("#fef3c7");
            using (var bf = new Font(Theme.Ui, 8.5f, FontStyle.Bold))
            {
                var sz = TextRenderer.MeasureText(g, badge, bf);
                var br = new RectangleF(Width - pad - sz.Width - 12 * S, (Height - sz.Height - 6 * S) / 2, sz.Width + 12 * S, sz.Height + 6 * S);
                using (var path = Theme.Round(br, br.Height / 2))
                using (var b = new SolidBrush(bBg))
                    g.FillPath(b, path);
                TextRenderer.DrawText(g, badge, bf, Rectangle.Round(br), bFg,
                    TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter | TextFormatFlags.SingleLine);

                int x = pad * 2 + tile - (int)(2 * S), right = (int)br.Left - pad;
                using (var tf = new Font(Theme.Ui, 11f, FontStyle.Bold))
                    TextRenderer.DrawText(g, Printer.Title, tf, new Rectangle(x, pad - (int)(1 * S), right - x, tile / 2 + (int)(2 * S)), Theme.Fg,
                        TextFormatFlags.Left | TextFormatFlags.Bottom | TextFormatFlags.EndEllipsis | TextFormatFlags.SingleLine);
                using (var sf = new Font(Theme.Mono, 8.5f))
                    TextRenderer.DrawText(g, "USB · " + Printer.Brand + " " + Printer.Model, sf,
                        new Rectangle(x, pad + tile / 2 + (int)(3 * S), right - x, tile / 2), Theme.Muted,
                        TextFormatFlags.Left | TextFormatFlags.Top | TextFormatFlags.EndEllipsis | TextFormatFlags.SingleLine);
            }
        }
    }

    class MainForm : Form
    {
        readonly Label brand = new Label();
        readonly Panel header = new Panel();
        readonly Label title = new Label();
        readonly Label status = new Label();
        readonly Panel list = new Panel();
        readonly Notice notice = new Notice();
        readonly SlimProgress progress = new SlimProgress();
        readonly FlatButton install = new FlatButton { Primary = true };
        readonly FlatButton rescan = new FlatButton();
        readonly LinkLabel modelLink = new LinkLabel();
        readonly LinkLabel supportLink = new LinkLabel();
        List<Found> found = new List<Found>();
        Found selected;
        bool busy;

        public MainForm()
        {
            SuspendLayout();
            AutoScaleDimensions = new SizeF(96f, 96f);
            AutoScaleMode = AutoScaleMode.Dpi;
            Text = "Установка драйвера принтера";
            Font = new Font(Theme.Ui, 10f);
            BackColor = Theme.Bg;
            ForeColor = Theme.Fg;
            FormBorderStyle = FormBorderStyle.FixedSingle;
            MaximizeBox = false;
            StartPosition = FormStartPosition.CenterScreen;
            ClientSize = new Size(600, 470);
            try { Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath); } catch { }

            // Шапка как на сайте: белая, логотип и «Xprinter · Поддержка» моноширинным
            header.SetBounds(0, 0, 600, 56);
            header.BackColor = Theme.Bg;
            header.Paint += (s, e) =>
            {
                float sc = header.DeviceDpi / 96f;
                using (var p = new Pen(Theme.Border))
                    e.Graphics.DrawLine(p, 0, header.Height - 1, header.Width, header.Height - 1);
                using (var f = new Font(Theme.Icons, 15f))
                    TextRenderer.DrawText(e.Graphics, "", f, new Rectangle((int)(22 * sc), 0, (int)(28 * sc), header.Height), Theme.Accent,
                        TextFormatFlags.VerticalCenter | TextFormatFlags.HorizontalCenter);
            };
            brand.SetBounds(58, 0, 400, 55);
            brand.TextAlign = ContentAlignment.MiddleLeft;
            brand.Font = new Font(Theme.Mono, 11f, FontStyle.Bold);
            brand.Text = "Xprinter · Поддержка";
            brand.BackColor = Color.Transparent;
            header.Controls.Add(brand);

            title.SetBounds(24, 72, 552, 34);
            title.Font = new Font(Theme.Mono, 16f, FontStyle.Bold);
            title.Text = "Установка драйвера";

            status.SetBounds(24, 110, 552, 44);
            status.ForeColor = Theme.Muted;

            list.SetBounds(24, 160, 552, 156);
            list.AutoScroll = true;
            list.BackColor = Theme.Bg;

            notice.SetBounds(24, 160, 552, 96);
            notice.Visible = false;

            progress.SetBounds(24, 326, 552, 6);
            progress.Visible = false;

            install.SetBounds(24, 346, 230, 42);
            install.Text = "Установить драйвер";
            install.Click += async (s, e) => await InstallSelected();
            rescan.SetBounds(266, 346, 150, 42);
            rescan.Text = "Искать снова";
            rescan.Click += (s, e) => ScanAsync();

            foreach (var l in new[] { modelLink, supportLink })
            {
                l.LinkColor = Theme.Accent;
                l.ActiveLinkColor = Theme.AccentHover;
                l.VisitedLinkColor = Theme.Accent;
                l.LinkBehavior = LinkBehavior.HoverUnderline;
            }
            modelLink.SetBounds(24, 408, 552, 22);
            modelLink.LinkClicked += (s, e) => OpenUrl(Catalog.Site + (selected != null && selected.Slug != null ? selected.Slug + "/" : ""));
            supportLink.SetBounds(24, 434, 552, 22);
            supportLink.Text = "Не получается? Напишите нам в Telegram @xprintershop";
            supportLink.LinkClicked += (s, e) => OpenUrl(Catalog.Telegram);

            Controls.AddRange(new Control[] { header, title, status, notice, list, progress, install, rescan, modelLink, supportLink });
            ResumeLayout(false);
            Shown += (s, e) => ScanAsync();
        }

        static void OpenUrl(string url)
        {
            try { Process.Start(new ProcessStartInfo(url) { UseShellExecute = true }); } catch { }
        }

        void SetBusy(bool b)
        {
            busy = b;
            install.Enabled = !b && selected != null;
            rescan.Enabled = !b;
            list.Enabled = !b;
            UseWaitCursor = b;
        }

        void Fill()
        {
            list.SuspendLayout();
            foreach (Control c in list.Controls.Cast<Control>().ToList()) c.Dispose();
            int y = 0, h = (int)(68 * DeviceDpi / 96f), gap = (int)(10 * DeviceDpi / 96f);
            foreach (var f in found)
            {
                var card = new PrinterCard(f);
                card.SetBounds(0, y, list.ClientSize.Width - (found.Count > 2 ? SystemInformation.VerticalScrollBarWidth : 0), h);
                card.Click += (s, e) => { if (!busy) Choose(((PrinterCard)s).Printer); };
                list.Controls.Add(card);
                y += h + gap;
            }
            list.ResumeLayout();
        }

        void Choose(Found f)
        {
            selected = f;
            foreach (PrinterCard c in list.Controls) { c.Selected = c.Printer == f; c.Invalidate(); }
            ShowSelected();
        }

        async void ScanAsync()
        {
            if (busy) return;
            SetBusy(true);
            notice.Show(NoticeKind.None, "");
            status.Text = "Ищу принтер…";
            selected = null;
            try
            {
                found = await Task.Run(() => Detector.Scan());
            }
            catch (Exception ex)
            {
                Log.Write("scan error: " + ex);
                found = new List<Found>();
            }
            Fill();
            SetBusy(false);
            if (found.Count > 0) Choose(found.FirstOrDefault(f => !f.DriverOk) ?? found[0]);
            else ShowSelected();
        }

        void ShowSelected()
        {
            var f = selected;
            install.Enabled = !busy && f != null;
            list.Visible = found.Count > 0;
            if (f == null)
            {
                status.Text = "Подключите принтер к компьютеру USB-кабелем, включите его и нажмите «Искать снова».";
                notice.Show(NoticeKind.Warn, "Принтер не найден.\nУтилита находит принтеры, подключённые по USB. " +
                    "Для Bluetooth и macOS — инструкции на сайте.");
                modelLink.Text = "Драйверы и инструкции на сайте";
                install.Text = "Установить драйвер";
                return;
            }
            notice.Show(NoticeKind.None, "");
            status.Text = f.DriverOk
                ? "Драйвер уже установлен. Переустановите, если принтер не печатает."
                : "Нажмите «Установить драйвер» — утилита скачает драйвер " + f.Pack.Title + " и установит его.";
            install.Text = f.DriverOk ? "Переустановить" : "Установить драйвер";
            modelLink.Text = f.Slug != null ? "Страница " + f.Title + " на сайте: программы, видео, ответы" : "Драйверы и инструкции на сайте";
        }

        void Result(NoticeKind kind, string text)
        {
            list.Visible = false;
            notice.Show(kind, text);
        }

        async Task InstallSelected()
        {
            var f = selected;
            if (f == null || busy) return;
            SetBusy(true);
            progress.Visible = true;
            progress.Indeterminate = true;
            Log.Write("install " + f.HardwareId + " pack=" + f.Pack.Id);
            bool done = false;
            try
            {
                status.Text = "Ищу свежую версию драйвера…";
                var latest = await Task.Run(() => Cloud.Latest(f.Pack));
                var path = Path.Combine(Log.Dir, latest.Item1);
                if (!File.Exists(path) || new FileInfo(path).Length != latest.Item3)
                {
                    progress.Indeterminate = false;
                    await Cloud.Download(latest.Item2, path, latest.Item3, (got, total) =>
                    {
                        progress.Value = total > 0 ? (int)(got * 100 / total) : 0;
                        status.Text = "Скачиваю " + latest.Item1 + ": " + (got >> 20) + " из " + (total >> 20) + " МБ";
                    });
                }
                progress.Indeterminate = true;
                status.Text = "Проверяю подпись драйвера…";
                await Task.Run(() => Installer.VerifySignature(path));

                if (f.Pack.Seagull)
                {
                    status.Text = "Устанавливаю драйвер. Это займёт до пары минут…";
                    var outDir = Path.Combine(Log.Dir, Path.GetFileNameWithoutExtension(latest.Item1).Replace(' ', '_'));
                    await Task.Run(() => Installer.InstallSeagull(path, outDir));
                }
                else
                {
                    status.Text = "Открылся установщик " + f.Pack.Title + ". Пройдите его до конца.";
                    await Task.Run(() => Installer.RunVendorSetup(path));
                }

                status.Text = "Проверяю установку…";
                Found after = null;
                for (int i = 0; i < 30 && (after == null || !after.DriverOk); i++)
                {
                    await Task.Delay(2000);
                    var list2 = await Task.Run(() => Detector.Scan());
                    after = list2.FirstOrDefault(x => x.HardwareId == f.HardwareId);
                }
                if (after != null && after.DriverOk)
                {
                    Log.Write("ok: " + after.Queue);
                    status.Text = "Готово.";
                    Result(NoticeKind.Success, "Принтер «" + after.Queue + "» установлен.\n" +
                        "Теперь задайте размер этикетки: «Принтеры и сканеры» → принтер → «Настройки печати» → «Параметры страницы».");
                }
                else
                {
                    Log.Write("not confirmed");
                    status.Text = "Драйвер установлен, но принтер не появился в списке принтеров.";
                    Result(NoticeKind.Warn, "Выключите и включите принтер, затем нажмите «Искать снова». " +
                        "Не поможет — напишите нам и приложите журнал:\n" + Path.Combine(Log.Dir, "log.txt"));
                }
                done = true;
            }
            catch (Exception ex)
            {
                Log.Write("install error: " + ex);
                status.Text = "Не удалось установить драйвер.";
                Result(NoticeKind.Error, ex.Message + "\nПроверьте интернет и попробуйте ещё раз. Журнал: " + Path.Combine(Log.Dir, "log.txt"));
                done = true;
            }
            finally
            {
                progress.Visible = false;
                SetBusy(false);
            }
            if (done)
            {
                // Обновить статус в карточке, но оставить плашку с результатом
                found = await Task.Run(() => Detector.Scan());
                Fill();
                selected = found.FirstOrDefault(x => x.HardwareId == f.HardwareId);
                foreach (PrinterCard c in list.Controls) c.Selected = c.Printer == selected;
                install.Enabled = selected != null;
                install.Text = selected != null && selected.DriverOk ? "Переустановить" : "Установить драйвер";
            }
        }
    }

    static class Program
    {
        [STAThread]
        static void Main()
        {
            ServicePointManager.SecurityProtocol |= SecurityProtocolType.Tls12;
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Log.Write("start " + Environment.OSVersion + (Environment.Is64BitProcess ? " x64" : " x86"));
            Application.Run(new MainForm());
        }
    }
}
