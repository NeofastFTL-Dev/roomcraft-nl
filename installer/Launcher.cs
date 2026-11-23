// RoomCraft NL desktop launcher (C# 5, .NET Framework 4.8).
//
// Starts the bundled PostgreSQL cluster, prepares the database and runs the
// RoomCraft server with the bundled Node.js runtime, then opens the app window
// (electron\RoomCraftWindow.exe, which carries its own engine). No browser, no
// WebView2 runtime and no accounts: the launcher sets DESKTOP_MODE, so the
// server serves a single local user.
// Also contains the uninstaller and an automated self-test:
//   RoomCraft.exe                 normal window
//   RoomCraft.exe --selftest      start, verify HTTP + login, stop, write log
//   RoomCraft.exe --uninstall     remove shortcuts, registry key and program files
//   RoomCraft.exe --uninstall /S  same, without dialogs, keeping data\
//                                 (add /PURGEDATA to delete projects as well)
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;

namespace RoomCraft
{
    internal static class Program
    {
        [STAThread]
        private static int Main(string[] args)
        {
            string mode = args.Length > 0 ? args[0].ToLowerInvariant() : string.Empty;
            if (mode == "--uninstall")
            {
                return Uninstaller.Run(args);
            }
            if (mode == "--selftest")
            {
                return SelfTest.Run();
            }
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            MainForm main = new MainForm();
            Application.Run(main);
            return main.Shutdown();
        }
    }

    /// <summary>Locations inside the install directory.</summary>
    internal static class Paths
    {
        public static string BaseDir
        {
            get { return AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\'); }
        }

        public static string AppDir { get { return Path.Combine(BaseDir, "app"); } }
        public static string NodeExe { get { return Path.Combine(BaseDir, "node", "node.exe"); } }
        public static string PgBin { get { return Path.Combine(BaseDir, "pgsql", "bin"); } }
        public static string PgCtl { get { return Path.Combine(PgBin, "pg_ctl.exe"); } }
        public static string Initdb { get { return Path.Combine(PgBin, "initdb.exe"); } }
        public static string DataDir { get { return Path.Combine(BaseDir, "data"); } }
        public static string PgData { get { return Path.Combine(DataDir, "pgdata"); } }
        public static string LogsDir { get { return Path.Combine(DataDir, "logs"); } }
        public static string EnvFile { get { return Path.Combine(BaseDir, "roomcraft.env"); } }
        public static string PortsFile { get { return Path.Combine(DataDir, "ports.txt"); } }
        public static string SeedMarker { get { return Path.Combine(DataDir, "seeded.txt"); } }
        public static string WindowLog { get { return Path.Combine(LogsDir, "window.log"); } }

        public static string WindowExe
        {
            get { return Path.Combine(BaseDir, "electron", "RoomCraftWindow.exe"); }
        }

        public static string TsxCli
        {
            get { return Path.Combine(BaseDir, "node_modules", "tsx", "dist", "cli.mjs"); }
        }

        public static string Bootstrap
        {
            get { return Path.Combine(AppDir, "desktop-db.mjs"); }
        }
    }

    /// <summary>Owns the PostgreSQL and Node processes.</summary>
    internal sealed class Services
    {
        private const string DbUser = "roomcraft";
        private const string DbPassword = "roomcraft";
        private Process server;
        private readonly object logGate = new object();

        public int WebPort { get; private set; }
        public int PgPort { get; private set; }
        public string LastError { get; private set; }
        public bool Running { get; private set; }
        public string BaseUrl
        {
            get { return "http://127.0.0.1:" + WebPort + "/"; }
        }

        public bool Start(Action<string> log, Action<string> status)
        {
            LastError = null;
            try
            {
                Directory.CreateDirectory(Paths.DataDir);
                Directory.CreateDirectory(Paths.LogsDir);
                PgPort = ReadPort("PGPORT", 55432);
                WebPort = ReadPort("WEBPORT", 41731);
                SavePorts();

                Dictionary<string, string> env = BuildEnvironment();
                string sqlLog = Path.Combine(Paths.LogsDir, "postgres.log");

                if (!File.Exists(Path.Combine(Paths.PgData, "PG_VERSION")))
                {
                    status("Database voor het eerst initialiseren\u2026");
                    log("PostgreSQL-cluster initialiseren in " + Paths.PgData);
                    string pwFile = Path.Combine(Paths.DataDir, "initdb-password.tmp");
                    File.WriteAllText(pwFile, DbPassword);
                    int init = Run(
                        Paths.Initdb,
                        "-D \"" + Paths.PgData + "\" -U " + DbUser + " --pwfile=\"" + pwFile +
                        "\" -A scram-sha-256 -E UTF8 --locale=C",
                        Paths.BaseDir, null, sqlLog, 180000);
                    try { File.Delete(pwFile); }
                    catch { }
                    if (init != 0)
                    {
                        LastError = "De database kon niet worden geinitialiseerd. Zie data\\logs\\postgres.log.";
                        return false;
                    }
                }

                status("Database starten\u2026");
                int pgStatus = Run(
                    Paths.PgCtl,
                    "-D \"" + Paths.PgData + "\" status",
                    Paths.BaseDir, null, null, 15000);
                if (pgStatus != 0)
                {
                    int start = Run(
                        Paths.PgCtl,
                        "-D \"" + Paths.PgData + "\" -l \"" + sqlLog + "\" -o \"-p " + PgPort +
                        " -c listen_addresses=127.0.0.1\" start",
                        Paths.BaseDir, null, null, 90000);
                    if (start != 0)
                    {
                        LastError = "PostgreSQL wilde niet starten. Zie data\\logs\\postgres.log.";
                        return false;
                    }
                }
                else
                {
                    // Already running: keep using its port if it differs.
                    Log(log, "PostgreSQL was al actief.");
                }

                status("Database controleren\u2026");
                int bootstrap = Run(
                    Paths.NodeExe,
                    "\"" + Paths.Bootstrap + "\"",
                    Paths.AppDir, env, Path.Combine(Paths.LogsDir, "bootstrap.log"), 180000);
                if (bootstrap != 0)
                {
                    LastError = "De databaseschema kon niet worden bijgewerkt. Zie data\\logs\\bootstrap.log.";
                    return false;
                }

                if (!File.Exists(Paths.SeedMarker))
                {
                    status("Voorbeeldcatalogus laden\u2026");
                    int seed = Run(
                        Paths.NodeExe,
                        "\"" + Paths.TsxCli + "\" prisma/seed.ts",
                        Paths.AppDir, env, Path.Combine(Paths.LogsDir, "seed.log"), 180000);
                    if (seed != 0)
                    {
                        LastError = "De demodata kon niet worden geladen. Zie data\\logs\\seed.log.";
                        return false;
                    }
                    File.WriteAllText(Paths.SeedMarker, DateTime.UtcNow.ToString("o"));
                }

                status("RoomCraft starten\u2026");
                server = StartServer(env, log);
                if (server == null)
                {
                    LastError = "De RoomCraft-server kon niet worden gestart.";
                    return false;
                }

                status("Wachten tot RoomCraft bereikbaar is\u2026");
                for (int attempt = 0; attempt < 240; attempt += 1)
                {
                    if (Health())
                    {
                        Running = true;
                        status("RoomCraft is klaar.");
                        log("RoomCraft draait op " + BaseUrl);
                        return true;
                    }
                    if (server.HasExited)
                    {
                        LastError = "De RoomCraft-server stopte onverwacht. Zie data\\logs\\server.log.";
                        return false;
                    }
                    Thread.Sleep(500);
                }
                LastError = "RoomCraft werd niet bereikbaar binnen 120 seconden. Zie data\\logs\\server.log.";
                return false;
            }
            catch (Exception error)
            {
                LastError = error.Message;
                log("Fout: " + error);
                return false;
            }
        }

        public void Stop()
        {
            Running = false;
            if (server != null)
            {
                try
                {
                    if (!server.HasExited)
                    {
                        Run("taskkill", "/PID " + server.Id + " /T /F", Paths.BaseDir, null, null, 20000);
                        server.WaitForExit(5000);
                    }
                }
                catch { }
                finally
                {
                    try { server.Dispose(); }
                    catch { }
                    server = null;
                }
            }
            if (Directory.Exists(Paths.PgData))
            {
                Run(
                    Paths.PgCtl,
                    "-D \"" + Paths.PgData + "\" stop -m fast",
                    Paths.BaseDir, null, null, 60000);
            }
        }

        public bool Health()
        {
            try
            {
                HttpWebRequest request = (HttpWebRequest)WebRequest.Create(
                    "http://127.0.0.1:" + WebPort + "/api/health");
                request.Timeout = 2500;
                request.Proxy = null;
                using (HttpWebResponse response = (HttpWebResponse)request.GetResponse())
                {
                    return response.StatusCode == HttpStatusCode.OK;
                }
            }
            catch
            {
                return false;
            }
        }

        private Process StartServer(Dictionary<string, string> env, Action<string> log)
        {
            ProcessStartInfo info = new ProcessStartInfo(
                Paths.NodeExe, "\"" + Paths.TsxCli + "\" server/index.ts");
            info.WorkingDirectory = Paths.AppDir;
            info.UseShellExecute = false;
            info.CreateNoWindow = true;
            info.RedirectStandardOutput = true;
            info.RedirectStandardError = true;
            foreach (KeyValuePair<string, string> entry in env)
            {
                info.EnvironmentVariables[entry.Key] = entry.Value;
            }

            string logFile = Path.Combine(Paths.LogsDir, "server.log");
            Process process = new Process();
            process.StartInfo = info;
            process.OutputDataReceived += delegate(object sender, DataReceivedEventArgs args)
            {
                if (args.Data != null) AppendLog(logFile, args.Data, log);
            };
            process.ErrorDataReceived += delegate(object sender, DataReceivedEventArgs args)
            {
                if (args.Data != null) AppendLog(logFile, args.Data, log);
            };
            process.Start();
            process.BeginOutputReadLine();
            process.BeginErrorReadLine();
            return process;
        }

        private static void AppendLog(string file, string line, Action<string> log)
        {
            try
            {
                lock (typeof(Services))
                {
                    File.AppendAllText(file, line + Environment.NewLine);
                }
            }
            catch { }
            log(line);
        }

        private void Log(Action<string> log, string line)
        {
            log(line);
        }

        private Dictionary<string, string> BuildEnvironment()
        {
            Dictionary<string, string> env = new Dictionary<string, string>();
            env["NODE_ENV"] = "production";
            env["PORT"] = WebPort.ToString();
            env["CLIENT_ORIGIN"] = "http://127.0.0.1:" + WebPort;
            env["DATABASE_URL"] = "postgresql://" + DbUser + ":" + DbPassword + "@127.0.0.1:" +
                PgPort + "/roomcraft?schema=public";
            env["JWT_SECRET"] = ReadOrCreateSecret();
            env["COOKIE_SECURE"] = "false";
            env["DESKTOP_MODE"] = "1";
            env["PGPASSWORD"] = DbPassword;
            env["PGPORT"] = PgPort.ToString();
            return env;
        }

        private static string ReadOrCreateSecret()
        {
            if (File.Exists(Paths.EnvFile))
            {
                foreach (string line in File.ReadAllLines(Paths.EnvFile))
                {
                    int split = line.IndexOf('=');
                    if (split > 0 && line.Substring(0, split).Trim() == "JWT_SECRET")
                    {
                        string value = line.Substring(split + 1).Trim().Trim('"');
                        if (value.Length >= 32) return value;
                    }
                }
            }
            string secret = Guid.NewGuid().ToString("N") + Guid.NewGuid().ToString("N");
            File.WriteAllText(Paths.EnvFile, "JWT_SECRET=" + secret + Environment.NewLine);
            return secret;
        }

        private static int ReadPort(string key, int fallback)
        {
            if (File.Exists(Paths.PortsFile))
            {
                foreach (string line in File.ReadAllLines(Paths.PortsFile))
                {
                    int split = line.IndexOf('=');
                    if (split > 0 && line.Substring(0, split).Trim() == key)
                    {
                        int parsed;
                        if (int.TryParse(line.Substring(split + 1).Trim(), out parsed) && IsFree(parsed))
                        {
                            return parsed;
                        }
                    }
                }
            }
            return FindFreePort(fallback);
        }

        private void SavePorts()
        {
            File.WriteAllText(
                Paths.PortsFile,
                "PGPORT=" + PgPort + Environment.NewLine + "WEBPORT=" + WebPort + Environment.NewLine);
        }

        private static int FindFreePort(int start)
        {
            for (int port = start; port < start + 200; port += 1)
            {
                if (IsFree(port)) return port;
            }
            throw new InvalidOperationException("Geen vrije poort gevonden vanaf " + start + ".");
        }

        private static bool IsFree(int port)
        {
            TcpListener listener = null;
            try
            {
                listener = new TcpListener(IPAddress.Loopback, port);
                listener.Start();
                return true;
            }
            catch
            {
                return false;
            }
            finally
            {
                if (listener != null) listener.Stop();
            }
        }

        /// <summary>Runs a helper process, appends its output to a log and returns its exit code.</summary>
        internal static int Run(
            string exe,
            string arguments,
            string workingDirectory,
            Dictionary<string, string> environment,
            string logFile,
            int timeoutMs)
        {
            ProcessStartInfo info = new ProcessStartInfo(exe, arguments);
            info.WorkingDirectory = workingDirectory;
            info.UseShellExecute = false;
            info.CreateNoWindow = true;
            info.RedirectStandardOutput = true;
            info.RedirectStandardError = true;
            if (environment != null)
            {
                foreach (KeyValuePair<string, string> entry in environment)
                {
                    info.EnvironmentVariables[entry.Key] = entry.Value;
                }
            }

            StringBuilder output = new StringBuilder();
            using (Process process = new Process())
            {
                process.StartInfo = info;
                process.OutputDataReceived += delegate(object sender, DataReceivedEventArgs args)
                {
                    if (args.Data != null)
                    {
                        lock (output) { output.AppendLine(args.Data); }
                    }
                };
                process.ErrorDataReceived += delegate(object sender, DataReceivedEventArgs args)
                {
                    if (args.Data != null)
                    {
                        lock (output) { output.AppendLine(args.Data); }
                    }
                };
                process.Start();
                process.BeginOutputReadLine();
                process.BeginErrorReadLine();
                bool exited = process.WaitForExit(timeoutMs);
                Thread.Sleep(150);
                if (!exited)
                {
                    try { process.Kill(); }
                    catch { }
                    if (logFile != null)
                    {
                        lock (output)
                        {
                            File.AppendAllText(logFile, "[" + Path.GetFileName(exe) + "] time-out" + Environment.NewLine);
                        }
                    }
                    return -1;
                }
                // Do not call the blocking WaitForExit() overload: helpers such as
                // pg_ctl start spawn PostgreSQL, which inherits the redirected pipes
                // and would keep them open forever.
                string text;
                lock (output) { text = output.ToString(); }
                if (logFile != null)
                {
                    try
                    {
                        File.AppendAllText(
                            logFile,
                            "[" + Path.GetFileName(exe) + " " + arguments + "]" +
                            Environment.NewLine + text + Environment.NewLine);
                    }
                    catch { }
                }
                return process.ExitCode;
            }
        }
    }

    internal sealed class MainForm : Form
    {
        private readonly Services services = new Services();
        private readonly Label statusLabel = new Label();
        private Process window;
        private bool failed;

        /// <summary>
        /// Startup window: shows what the launcher is doing until the app window is
        /// up, then gets out of the way. The app window is a separate program with
        /// its own engine; this launcher only supervises the server and database.
        /// </summary>
        public MainForm()
        {
            Text = "RoomCraft NL";
            FormBorderStyle = FormBorderStyle.FixedSingle;
            MaximizeBox = false;
            MinimizeBox = false;
            ClientSize = new Size(470, 150);
            StartPosition = FormStartPosition.CenterScreen;
            BackColor = Color.FromArgb(22, 19, 15);
            ForeColor = Color.FromArgb(238, 230, 218);
            Font = new Font("Segoe UI", 9F);

            Label titleLabel = new Label();
            titleLabel.Text = "RoomCraft NL";
            titleLabel.Font = new Font("Segoe UI Semibold", 14F);
            titleLabel.AutoSize = true;
            titleLabel.Location = new Point(20, 18);
            Controls.Add(titleLabel);

            statusLabel.Text = "RoomCraft NL wordt gestart\u2026";
            statusLabel.Location = new Point(22, 64);
            statusLabel.Size = new Size(426, 64);
            statusLabel.ForeColor = Color.FromArgb(180, 170, 158);
            Controls.Add(statusLabel);

            Load += delegate { StartServices(); };
        }

        private void StartServices()
        {
            AppendLog("RoomCraft wordt gestart\u2026");
            Thread worker = new Thread(delegate()
            {
                bool ok = services.Start(AppendLog, SetStatus);
                if (!ok)
                {
                    SetStatus(services.LastError ?? "Starten mislukt.");
                    AppendLog("Starten mislukt: " + (services.LastError ?? "onbekende fout"));
                }
                if (ok)
                {
                    RunOnUi(delegate { StartWindow(); });
                }
            });
            worker.IsBackground = true;
            worker.Start();
        }

        /// <summary>
        /// Opens the app window. It carries its own engine, so nothing has to be
        /// installed on the machine and no browser is opened.
        /// </summary>
        private void StartWindow()
        {
            string exe = Paths.WindowExe;
            if (!File.Exists(exe))
            {
                Fail("Het toepassingsvenster ontbreekt (" + exe + "). " +
                    "Installeer RoomCraft NL opnieuw.");
                return;
            }
            try
            {
                if (File.Exists(Paths.WindowLog)) File.Delete(Paths.WindowLog);
            }
            catch { }

            ProcessStartInfo info = new ProcessStartInfo(
                exe,
                "--rc-url=" + services.BaseUrl +
                " --rc-data=\"" + Paths.DataDir + "\"" +
                " --rc-log=\"" + Paths.WindowLog + "\"");
            info.WorkingDirectory = Path.Combine(Paths.BaseDir, "electron");
            info.UseShellExecute = false;
            info.CreateNoWindow = true;
            try
            {
                window = Process.Start(info);
            }
            catch (Exception error)
            {
                Fail("Het toepassingsvenster kon niet starten: " + error.Message);
                return;
            }
            if (window == null)
            {
                Fail("Het toepassingsvenster kon niet starten.");
                return;
            }
            AppendLog("Venster gestart (pid " + window.Id + ")");

            Thread watcher = new Thread(delegate()
            {
                for (int attempt = 0; attempt < 300; attempt += 1)
                {
                    if (window.HasExited)
                    {
                        RunOnUi(delegate
                        {
                            Fail("Het venster stopte onverwacht. Zie data\\logs\\window.log.");
                        });
                        return;
                    }
                    if (WindowReady())
                    {
                        AppendLog("Venster klaar.");
                        RunOnUi(delegate { Close(); });
                        return;
                    }
                    Thread.Sleep(300);
                }
                RunOnUi(delegate
                {
                    Fail("Het venster werd niet klaar binnen 90 seconden. " +
                        "Zie data\\logs\\window.log.");
                });
            });
            watcher.IsBackground = true;
            watcher.Start();
        }

        /// <summary>True once the window has reported that the interface rendered.</summary>
        private static bool WindowReady()
        {
            try
            {
                if (!File.Exists(Paths.WindowLog)) return false;
                using (FileStream stream = new FileStream(
                    Paths.WindowLog, FileMode.Open, FileAccess.Read, FileShare.ReadWrite))
                using (StreamReader reader = new StreamReader(stream))
                {
                    return reader.ReadToEnd().IndexOf("UI geladen:", StringComparison.Ordinal) >= 0;
                }
            }
            catch
            {
                return false;
            }
        }

        private void Fail(string message)
        {
            failed = true;
            SetStatus("Starten mislukt.");
            AppendLog(message);
            services.Stop();
            RunOnUi(delegate
            {
                MessageBox.Show(
                    this,
                    message,
                    "RoomCraft NL",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error);
            });
        }

        /// <summary>
        /// Keeps the launcher alive for as long as the window is open, then stops the
        /// server and PostgreSQL again. Called once the startup window has closed.
        /// </summary>
        public int Shutdown()
        {
            if (window != null)
            {
                try { window.WaitForExit(); }
                catch { }
                try { window.Dispose(); }
                catch { }
                window = null;
                AppendLog("Venster gesloten.");
            }
            services.Stop();
            return failed ? 1 : 0;
        }

        private void SetStatus(string text)
        {
            RunOnUi(delegate { statusLabel.Text = text; });
        }

        private void AppendLog(string text)
        {
            try
            {
                Directory.CreateDirectory(Paths.LogsDir);
                File.AppendAllText(
                    Path.Combine(Paths.LogsDir, "launcher.log"),
                    DateTime.Now.ToString("s") + " " + text + Environment.NewLine);
            }
            catch { }
        }

        private void RunOnUi(MethodInvoker action)
        {
            if (IsDisposed) return;
            if (InvokeRequired)
            {
                try { BeginInvoke(action); }
                catch { }
            }
            else
            {
                action();
            }
        }
    }

    /// <summary>Automated check of a fresh installation: start, HTTP + login, stop.</summary>
    internal static class SelfTest
    {
        public static int Run()
        {
            List<string> lines = new List<string>();
            Services services = new Services();
            Action<string> log = delegate(string line) { lines.Add(line); };
            Action<string> status = delegate(string line) { lines.Add("STATUS " + line); };
            bool ok = false;
            try
            {
                ok = services.Start(log, status);
                if (ok)
                {
                    ok = CheckDesktopApp(services, lines);
                }
                else
                {
                    lines.Add("FAIL start: " + (services.LastError ?? "onbekend"));
                }
            }
            catch (Exception error)
            {
                lines.Add("FAIL exception: " + error);
                ok = false;
            }
            finally
            {
                services.Stop();
            }

            Directory.CreateDirectory(Paths.DataDir);
            lines.Add(ok ? "PASS" : "FAIL");
            File.WriteAllText(Path.Combine(Paths.DataDir, "selftest.log"), string.Join(Environment.NewLine, lines.ToArray()));
            return ok ? 0 : 1;
        }

        /// <summary>Checks that the local app is served and the desktop user can work.</summary>
        private static bool CheckDesktopApp(Services services, List<string> lines)
        {
            try
            {
                string origin = "http://127.0.0.1:" + services.WebPort;

                HttpWebRequest page = (HttpWebRequest)WebRequest.Create(origin + "/");
                page.Proxy = null;
                using (HttpWebResponse response = (HttpWebResponse)page.GetResponse())
                using (StreamReader reader = new StreamReader(response.GetResponseStream()))
                {
                    string html = reader.ReadToEnd();
                    bool rendered = html.IndexOf("RoomCraft", StringComparison.OrdinalIgnoreCase) >= 0;
                    lines.Add((rendered ? "PASS" : "FAIL") + " index.html served");
                    if (!rendered) return false;
                }

                // Desktop mode has no login: /api/auth/me already returns the local user.
                HttpWebRequest me = (HttpWebRequest)WebRequest.Create(origin + "/api/auth/me");
                me.Proxy = null;
                using (HttpWebResponse response = (HttpWebResponse)me.GetResponse())
                using (StreamReader reader = new StreamReader(response.GetResponseStream()))
                {
                    string json = reader.ReadToEnd();
                    bool ok = response.StatusCode == HttpStatusCode.OK &&
                        json.IndexOf("\"user\":{", StringComparison.Ordinal) >= 0 &&
                        json.IndexOf("\"desktop\":true", StringComparison.Ordinal) >= 0;
                    lines.Add((ok ? "PASS" : "FAIL") + " desktop user");
                    if (!ok) return false;
                }

                HttpWebRequest projects = (HttpWebRequest)WebRequest.Create(origin + "/api/projects");
                projects.Proxy = null;
                using (HttpWebResponse response = (HttpWebResponse)projects.GetResponse())
                using (StreamReader reader = new StreamReader(response.GetResponseStream()))
                {
                    string json = reader.ReadToEnd();
                    bool ok = response.StatusCode == HttpStatusCode.OK &&
                        json.IndexOf("\"projects\"", StringComparison.Ordinal) >= 0;
                    lines.Add((ok ? "PASS" : "FAIL") + " projects " + (int)response.StatusCode);
                    if (!ok) return false;
                }
                return CheckWindow(services, lines);
            }
            catch (Exception error)
            {
                lines.Add("FAIL http: " + error.Message);
                return false;
            }
        }

        /// <summary>Checks that the app window really starts and renders the interface.</summary>
        private static bool CheckWindow(Services services, List<string> lines)
        {
            if (!File.Exists(Paths.WindowExe))
            {
                lines.Add("FAIL app window missing");
                return false;
            }
            int code = Services.Run(
                Paths.WindowExe,
                "--rc-selftest --rc-url=http://127.0.0.1:" + services.WebPort +
                "/ --rc-data=\"" + Paths.DataDir + "\"" +
                " --rc-log=\"" + Path.Combine(Paths.LogsDir, "selftest-window.log") + "\"",
                Path.Combine(Paths.BaseDir, "electron"),
                null,
                null,
                90000);
            bool ok = code == 0;
            lines.Add((ok ? "PASS" : "FAIL") + " app window rendered (exit " + code + ")");
            return ok;
        }
    }

    internal static class Uninstaller
    {
        public static int Run(string[] args)
        {
            bool silent = false;
            bool purgeData = false;
            foreach (string arg in args)
            {
                if (arg.Equals("/S", StringComparison.OrdinalIgnoreCase) ||
                    arg.Equals("--silent", StringComparison.OrdinalIgnoreCase))
                {
                    silent = true;
                }
                else if (arg.Equals("/PURGEDATA", StringComparison.OrdinalIgnoreCase) ||
                    arg.Equals("--purge-data", StringComparison.OrdinalIgnoreCase))
                {
                    purgeData = true;
                }
            }

            if (!silent)
            {
                DialogResult confirm = MessageBox.Show(
                    "RoomCraft NL verwijderen van deze computer?",
                    "RoomCraft NL verwijderen",
                    MessageBoxButtons.YesNo,
                    MessageBoxIcon.Question);
                if (confirm != DialogResult.Yes) return 1;
            }

            // Projects are only deleted on an explicit request: a silent uninstall
            // must never throw away the user's data. /PURGEDATA is the opt-in.
            bool deleteData = purgeData;
            if (!silent && !purgeData)
            {
                deleteData = MessageBox.Show(
                    "Ook je opgeslagen ontwerpen en instellingen verwijderen?\n\n" +
                    "Kies Nee om je gegevens te bewaren.",
                    "Gegevens verwijderen",
                    MessageBoxButtons.YesNo,
                    MessageBoxIcon.Question,
                    MessageBoxDefaultButton.Button2) == DialogResult.Yes;
            }

            bool hadData = Directory.Exists(Paths.DataDir);

            // The app window runs in its own process; stop it before the files go.
            Services.Run("taskkill", "/IM RoomCraftWindow.exe /T /F", Paths.BaseDir, null, null, 20000);
            Services services = new Services();
            services.Stop();

            try
            {
                string programs = Environment.GetFolderPath(Environment.SpecialFolder.Programs);
                string startMenu = Path.Combine(programs, "RoomCraft NL");
                if (Directory.Exists(startMenu)) Directory.Delete(startMenu, true);
                string desktop = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory),
                    "RoomCraft NL.lnk");
                if (File.Exists(desktop)) File.Delete(desktop);
            }
            catch { }

            try
            {
                Registry.CurrentUser.DeleteSubKeyTree(
                    "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\RoomCraftNL", false);
            }
            catch { }

            if (deleteData)
            {
                try
                {
                    if (Directory.Exists(Paths.DataDir)) Directory.Delete(Paths.DataDir, true);
                }
                catch { }
                try
                {
                    if (File.Exists(Paths.EnvFile)) File.Delete(Paths.EnvFile);
                }
                catch { }
            }
            else if (hadData)
            {
                // The program files disappear; leave a pointer to what was kept.
                try
                {
                    File.WriteAllText(
                        Path.Combine(Paths.DataDir, "Gegevens-bewaard.txt"),
                        "RoomCraft NL is verwijderd. Je opgeslagen ontwerpen, de database en de\r\n" +
                        "instellingen zijn bewaard in deze map:\r\n\r\n" +
                        Paths.DataDir + "\r\n\r\n" +
                        "Installeer RoomCraft NL opnieuw in dezelfde map om je projecten weer te\r\n" +
                        "openen. Verwijder deze map handmatig als je de gegevens niet meer nodig hebt.\r\n");
                }
                catch { }
            }

            ScheduleRemoval(Paths.BaseDir);
            return 0;
        }

        /// <summary>
        /// Deletes the program files once this launcher has exited. data\ and the JWT
        /// secret are skipped unless the installation was purged; without data the
        /// now-empty install directory is removed too.
        /// </summary>
        private static void ScheduleRemoval(string installDir)
        {
            string script = Path.Combine(
                Path.GetTempPath(), "roomcraft-uninstall-" + Guid.NewGuid().ToString("N") + ".cmd");
            string root = installDir.Replace("%", "%%");
            string[] lines = new string[]
            {
                "@echo off",
                "ping 127.0.0.1 -n 4 > nul",
                "for /d %%D in (\"" + root + "\\*\") do (",
                "  if /i not \"%%~nxD\"==\"data\" rmdir /s /q \"%%D\"",
                ")",
                "for %%F in (\"" + root + "\\*\") do (",
                "  if /i not \"%%~nxF\"==\"roomcraft.env\" del /f /q \"%%F\"",
                ")",
                "rmdir \"" + root + "\" 2>nul",
                "del /f /q \"%~f0\"",
            };
            File.WriteAllText(script, string.Join("\r\n", lines) + "\r\n");
            ProcessStartInfo info = new ProcessStartInfo("cmd.exe", "/c \"" + script + "\"");
            info.CreateNoWindow = true;
            info.WindowStyle = ProcessWindowStyle.Hidden;
            info.UseShellExecute = false;
            Process.Start(info);
        }
    }
}
