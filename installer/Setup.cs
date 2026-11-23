// RoomCraft NL installer (C# 5, .NET Framework 4.8).
//
// A single self-contained Setup.exe: the application payload (Node.js runtime,
// PostgreSQL binaries, built app) is appended to this executable and extracted
// on install. Creates Start Menu/desktop shortcuts and an uninstall entry.
//
//   RoomCraftSetup.exe                 windowed installer
//   RoomCraftSetup.exe /S [/D=C:\path] silent install
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;

namespace RoomCraftSetup
{
    internal static class Program
    {
        private const string Marker = "RCPAYLOAD1";

        [STAThread]
        private static int Main(string[] args)
        {
            bool silent = false;
            string target = null;
            foreach (string arg in args)
            {
                if (arg.Equals("/S", StringComparison.OrdinalIgnoreCase) ||
                    arg.Equals("--silent", StringComparison.OrdinalIgnoreCase))
                {
                    silent = true;
                }
                else if (arg.StartsWith("/D=", StringComparison.OrdinalIgnoreCase))
                {
                    target = arg.Substring(3).Trim('"');
                }
            }

            string defaultDir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "Programs",
                "RoomCraft NL");
            string installDir = string.IsNullOrEmpty(target) ? defaultDir : Path.GetFullPath(target);

            if (silent)
            {
                try
                {
                    Installer.Install(installDir, false, false, delegate(string message) { }, delegate(int percent) { });
                    return 0;
                }
                catch (Exception error)
                {
                    try
                    {
                        File.WriteAllText(
                            Path.Combine(Path.GetTempPath(), "roomcraft-setup-error.log"),
                            error.ToString());
                    }
                    catch { }
                    return 1;
                }
            }

            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new SetupForm(installDir));
            return 0;
        }

        internal static string MarkerValue
        {
            get { return Marker; }
        }
    }

    /// <summary>
    /// The version this build stamped into the installer from package.json, so the
    /// uninstall entry cannot keep reporting an old release after an upgrade.
    /// </summary>
    internal static class AppVersion
    {
        public static string Value
        {
            get
            {
                AssemblyInformationalVersionAttribute attribute =
                    (AssemblyInformationalVersionAttribute)Attribute.GetCustomAttribute(
                        typeof(Program).Assembly,
                        typeof(AssemblyInformationalVersionAttribute));
                if (attribute != null && !string.IsNullOrEmpty(attribute.InformationalVersion))
                {
                    return attribute.InformationalVersion;
                }
                Version version = typeof(Program).Assembly.GetName().Version;
                return version != null ? version.ToString() : "0.0.0";
            }
        }
    }

    internal static class Installer
    {
        public static void Install(
            string installDir,
            bool desktopShortcut,
            bool startAfterInstall,
            Action<string> status,
            Action<int> progress)
        {
            status("Installatiemap voorbereiden\u2026");
            Directory.CreateDirectory(installDir);

            string payload = Path.Combine(
                Path.GetTempPath(), "roomcraft-payload-" + Guid.NewGuid().ToString("N") + ".zip");
            string staging = NewStagingDirectory(installDir);
            try
            {
                // Read and unpack the payload completely before anything installed is
                // touched: a truncated or corrupt Setup.exe must leave a working app.
                status("Installatiebestanden controleren\u2026");
                try
                {
                    ExtractPayload(Application.ExecutablePath, payload);
                    StagePayload(payload, staging, progress);
                }
                catch (Exception error)
                {
                    throw new IOException(
                        "Het installatiebestand is beschadigd of onvolledig. De bestaande " +
                        "installatie is niet gewijzigd. (" + error.Message + ")", error);
                }

                // The payload is verified and on disk, so the running app can now be
                // replaced. An upgrade has to replace running binaries: stop the launcher
                // with its Node child and the bundled PostgreSQL cluster it started.
                StopRunningApp(installDir);

                // Swap in the new program files. The old ones are moved aside instead of
                // deleted, so a failure while placing the new version can be rolled back.
                // data\ and roomcraft.env are left untouched.
                status("Nieuwe versie plaatsen\u2026");
                ReplaceProgramFiles(installDir, staging);
            }
            finally
            {
                try
                {
                    if (File.Exists(payload)) File.Delete(payload);
                }
                catch { }
                try
                {
                    if (Directory.Exists(staging)) DeleteDirectory(staging);
                }
                catch { }
            }

            // Files of the previous desktop build (the WebView2 window host) are not
            // part of this payload any more, so an upgrade has to remove them.
            RemoveLegacyFiles(installDir);

            progress(100);
            status("Instellingen opslaan\u2026");
            WriteEnvironmentFile(installDir);

            status("Snelkoppelingen maken\u2026");
            string launcher = Path.Combine(installDir, "RoomCraft.exe");
            string startMenuDir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.Programs), "RoomCraft NL");
            // Recreate the folder so an upgrade leaves exactly one shortcut.
            if (Directory.Exists(startMenuDir)) DeleteDirectory(startMenuDir);
            Directory.CreateDirectory(startMenuDir);
            CreateShortcut(Path.Combine(startMenuDir, "RoomCraft NL.lnk"), launcher, installDir);
            if (desktopShortcut)
            {
                CreateShortcut(
                    Path.Combine(
                        Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory),
                        "RoomCraft NL.lnk"),
                    launcher,
                    installDir);
            }

            status("Registreren bij Windows\u2026");
            RegisterUninstall(installDir, launcher);

            status("Klaar.");
            if (startAfterInstall)
            {
                Process.Start(launcher);
            }
        }

        /// <summary>
        /// Staging directory beside the install directory: the same volume, so the
        /// verified files can be moved into place without copying them again.
        /// </summary>
        private static string NewStagingDirectory(string installDir)
        {
            return NewSiblingDirectory(installDir, ".roomcraft-incoming-");
        }

        /// <summary>A uniquely named folder beside the install directory (same volume).</summary>
        private static string NewSiblingDirectory(string installDir, string prefix)
        {
            string parent = Path.GetDirectoryName(installDir);
            if (string.IsNullOrEmpty(parent)) parent = installDir;
            return Path.Combine(
                parent, prefix + Guid.NewGuid().ToString("N").Substring(0, 8));
        }

        /// <summary>
        /// Unpacks the payload into the staging directory. Nothing outside the staging
        /// directory is written, so a corrupt archive aborts before the upgrade starts.
        /// </summary>
        private static void StagePayload(string payloadPath, string stagingDir, Action<int> progress)
        {
            long total = 0;
            using (ZipArchive archive = ZipFile.OpenRead(payloadPath))
            {
                foreach (ZipArchiveEntry entry in archive.Entries)
                {
                    total += entry.Length;
                }
            }

            Directory.CreateDirectory(stagingDir);
            string root = Path.GetFullPath(stagingDir);
            string rootPrefix = root + Path.DirectorySeparatorChar;
            long done = 0;
            int reported = -1;
            using (ZipArchive archive = ZipFile.OpenRead(payloadPath))
            {
                foreach (ZipArchiveEntry entry in archive.Entries)
                {
                    string relative = entry.FullName.Replace('/', Path.DirectorySeparatorChar);
                    string destination = Path.GetFullPath(Path.Combine(root, relative));
                    if (!destination.StartsWith(rootPrefix, StringComparison.OrdinalIgnoreCase))
                    {
                        throw new IOException("Ongeldig pad in installatiepakket: " + entry.FullName);
                    }

                    if (entry.Name.Length == 0)
                    {
                        Directory.CreateDirectory(destination);
                        continue;
                    }

                    Directory.CreateDirectory(Path.GetDirectoryName(destination));
                    using (Stream source = entry.Open())
                    using (FileStream target = new FileStream(
                        destination, FileMode.Create, FileAccess.Write, FileShare.None))
                    {
                        byte[] buffer = new byte[1024 * 256];
                        int read;
                        while ((read = source.Read(buffer, 0, buffer.Length)) > 0)
                        {
                            target.Write(buffer, 0, read);
                            done += read;
                            if (total > 0)
                            {
                                int percent = (int)(done * 100 / total);
                                if (percent != reported)
                                {
                                    reported = percent;
                                    progress(percent);
                                }
                            }
                        }
                    }
                }
            }
        }

        /// <summary>
        /// Moves the verified staging tree into the install directory, recording every
        /// placed path so a failure can be undone.
        /// </summary>
        private static void MoveStagedFiles(string stagingDir, string installDir, List<string> placed)
        {
            // The program entries were moved aside just before this, so the target names
            // are free; a colliding unknown file makes the move fail and the rollback run
            // instead of being overwritten.
            foreach (string directory in Directory.GetDirectories(stagingDir))
            {
                string target = Path.Combine(installDir, Path.GetFileName(directory));
                Directory.Move(directory, target);
                placed.Add(target);
            }
#if ROLLBACK_TEST
            // Compiled only by the upgrade rollback check; never part of the shipped exe.
            throw new IOException("gesimuleerde fout na het plaatsen van de mappen");
#endif
            foreach (string file in Directory.GetFiles(stagingDir))
            {
                string target = Path.Combine(installDir, Path.GetFileName(file));
                File.Move(file, target);
                placed.Add(target);
            }
        }

        /// <summary>
        /// Stops the launcher (with its Node child) and the bundled database before an
        /// upgrade. taskkill and pg_ctl both wait for the processes to be gone, so the
        /// files are free when the move starts; data\ is never touched.
        /// </summary>
        private static void StopRunningApp(string installDir)
        {
            // The window is a separate program with its own engine; stop it first so
            // its binaries are free, then the launcher and its Node child.
            RunTool("taskkill", "/IM RoomCraftWindow.exe /T /F", 20000);
            RunTool("taskkill", "/IM RoomCraft.exe /T /F", 20000);

            string pgData = Path.Combine(installDir, "data", "pgdata");
            string pgCtl = Path.Combine(installDir, "pgsql", "bin", "pg_ctl.exe");
            if (Directory.Exists(pgData) && File.Exists(pgCtl))
            {
                // Killing the launcher leaves its cluster running and pgsql\bin
                // locked, so stop PostgreSQL through its own control program.
                RunTool(pgCtl, "-D \"" + pgData + "\" stop -m fast", 60000);
            }
        }

        /// <summary>Runs a helper tool (taskkill, pg_ctl) and waits for it to finish.</summary>
        private static void RunTool(string exe, string arguments, int timeoutMs)
        {
            try
            {
                ProcessStartInfo info = new ProcessStartInfo(exe, arguments);
                info.UseShellExecute = false;
                info.CreateNoWindow = true;
                using (Process process = Process.Start(info))
                {
                    if (process != null && !process.WaitForExit(timeoutMs))
                    {
                        try { process.Kill(); }
                        catch { }
                    }
                }
            }
            catch { }
        }

        /// <summary>Program entries that belong to a build; data\ and roomcraft.env never do.</summary>
        private static readonly string[] ProgramDirectories =
            new string[] { "app", "electron", "node", "pgsql", "node_modules" };

        private static readonly string[] ProgramFiles = new string[]
        {
            "RoomCraft.exe",
            "THIRD-PARTY-NOTICES.txt",
            "package.json",
            "package-lock.json",
        };

        /// <summary>
        /// Removes what earlier builds installed and this version no longer uses: the
        /// WebView2 window host and its browser profile.
        /// </summary>
        private static void RemoveLegacyFiles(string installDir)
        {
            string[] legacy = new string[]
            {
                "Microsoft.Web.WebView2.Core.dll",
                "Microsoft.Web.WebView2.WinForms.dll",
                "WebView2Loader.dll",
            };
            foreach (string name in legacy)
            {
                try
                {
                    string file = Path.Combine(installDir, name);
                    if (File.Exists(file)) File.Delete(file);
                }
                catch { }
            }
            try
            {
                string profile = Path.Combine(installDir, "data", "webview");
                if (Directory.Exists(profile)) DeleteDirectory(profile);
            }
            catch { }
        }

        /// <summary>
        /// Replaces the installed program files with the staged ones. The old files are
        /// moved to a backup folder beside the installation instead of being deleted; if
        /// placing the new version fails, the new files are removed and the old ones are
        /// moved back, so an upgrade can never leave a half-installed app behind.
        /// </summary>
        private static void ReplaceProgramFiles(string installDir, string stagingDir)
        {
            string backup = NewSiblingDirectory(installDir, ".roomcraft-previous-");
            Directory.CreateDirectory(backup);
            List<string> placed = new List<string>();
            try
            {
                MoveProgramFiles(installDir, backup);
                MoveStagedFiles(stagingDir, installDir, placed);
            }
            catch (Exception error)
            {
                string restoreProblem = Rollback(installDir, backup, placed);
                if (restoreProblem != null)
                {
                    throw new IOException(
                        "De nieuwe versie kon niet worden geplaatst en de vorige installatie " +
                        "kon niet volledig worden hersteld (" + restoreProblem + "). De oude " +
                        "bestanden staan in " + backup + ". Sluit RoomCraft NL en probeer het " +
                        "opnieuw. (" + error.Message + ")", error);
                }
                throw new IOException(
                    "De nieuwe versie kon niet worden geplaatst. De vorige installatie is " +
                    "hersteld. Sluit RoomCraft NL en probeer het opnieuw. (" + error.Message + ")",
                    error);
            }

            try
            {
                DeleteDirectory(backup);
            }
            catch { }
        }

        /// <summary>Moves every program directory and file from one folder to another.</summary>
        private static void MoveProgramFiles(string sourceDir, string targetDir)
        {
            foreach (string name in ProgramDirectories)
            {
                string source = Path.Combine(sourceDir, name);
                if (!Directory.Exists(source)) continue;
                Directory.Move(source, Path.Combine(targetDir, name));
            }
            foreach (string name in ProgramFiles)
            {
                string source = Path.Combine(sourceDir, name);
                if (!File.Exists(source)) continue;
                File.Move(source, Path.Combine(targetDir, name));
            }
        }

        /// <summary>
        /// Removes whatever the failed attempt already placed and moves the old program
        /// files back. Returns null on success, or the error that prevented a full restore.
        /// </summary>
        private static string Rollback(string installDir, string backup, List<string> placed)
        {
            try
            {
                foreach (string target in placed)
                {
                    if (Directory.Exists(target)) DeleteDirectory(target);
                    else if (File.Exists(target)) File.Delete(target);
                }
                MoveProgramFiles(backup, installDir);
                DeleteDirectory(backup);
                return null;
            }
            catch (Exception error)
            {
                return error.Message;
            }
        }

        private static void DeleteDirectory(string directory)
        {
            foreach (string file in Directory.GetFiles(directory, "*", SearchOption.AllDirectories))
            {
                try { File.SetAttributes(file, FileAttributes.Normal); }
                catch { }
            }
            Directory.Delete(directory, true);
        }

        private static void WriteEnvironmentFile(string installDir)
        {
            string path = Path.Combine(installDir, "roomcraft.env");
            // Keep an existing secret: regenerating it would invalidate every session.
            if (HasSecret(path)) return;

            byte[] bytes = new byte[32];
            using (RandomNumberGenerator generator = RandomNumberGenerator.Create())
            {
                generator.GetBytes(bytes);
            }
            StringBuilder secret = new StringBuilder(64);
            foreach (byte value in bytes)
            {
                secret.Append(value.ToString("x2"));
            }
            File.WriteAllText(path, "JWT_SECRET=" + secret + Environment.NewLine);
        }

        private static bool HasSecret(string path)
        {
            if (!File.Exists(path)) return false;
            foreach (string line in File.ReadAllLines(path))
            {
                int split = line.IndexOf('=');
                if (split > 0 && line.Substring(0, split).Trim() == "JWT_SECRET" &&
                    line.Substring(split + 1).Trim().Trim('"').Length >= 32)
                {
                    return true;
                }
            }
            return false;
        }

        private static void CreateShortcut(string linkPath, string targetPath, string workingDirectory)
        {
            Type shellType = Type.GetTypeFromProgID("WScript.Shell");
            object shell = Activator.CreateInstance(shellType);
            dynamic shortcut = shellType.InvokeMember(
                "CreateShortcut",
                BindingFlags.InvokeMethod,
                null,
                shell,
                new object[] { linkPath });
            shortcut.TargetPath = targetPath;
            shortcut.WorkingDirectory = workingDirectory;
            shortcut.IconLocation = targetPath + ",0";
            shortcut.Description = "RoomCraft NL \u2014 interieurplanner";
            shortcut.Save();
        }

        private static void RegisterUninstall(string installDir, string launcher)
        {
            using (RegistryKey key = Registry.CurrentUser.CreateSubKey(
                "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\RoomCraftNL"))
            {
                key.SetValue("DisplayName", "RoomCraft NL");
                key.SetValue("DisplayVersion", AppVersion.Value);
                key.SetValue("Publisher", "RoomCraft");
                key.SetValue("DisplayIcon", launcher);
                key.SetValue("InstallLocation", installDir);
                key.SetValue("UninstallString", "\"" + launcher + "\" --uninstall");
                key.SetValue("NoModify", 1, RegistryValueKind.DWord);
                key.SetValue("NoRepair", 1, RegistryValueKind.DWord);
            }
        }

        /// <summary>
        /// Copies the appended zip payload out of this executable and checks its
        /// SHA-256. A truncated or bit-flipped installer is rejected here, before the
        /// installed program files are touched. The digest matters: the zip reader
        /// does not verify entry CRCs on read, so a flipped byte can otherwise unpack
        /// into a damaged binary without any error.
        /// </summary>
        private static void ExtractPayload(string executablePath, string destination)
        {
            const int digestLength = 32;
            byte[] markerBytes = Encoding.ASCII.GetBytes(Program.MarkerValue);
            using (FileStream source = File.OpenRead(executablePath))
            {
                if (source.Length < 8 + markerBytes.Length + digestLength + 1)
                {
                    throw new InvalidDataException("Dit installatiebestand bevat geen toepassing.");
                }

                long footer = source.Length - 8;
                source.Seek(footer, SeekOrigin.Begin);
                byte[] lengthBytes = new byte[8];
                ReadExactly(source, lengthBytes, 8);
                long payloadLength = BitConverter.ToInt64(lengthBytes, 0);

                long markerPosition = source.Length - 8 - markerBytes.Length;
                source.Seek(markerPosition, SeekOrigin.Begin);
                byte[] foundMarker = new byte[markerBytes.Length];
                ReadExactly(source, foundMarker, markerBytes.Length);
                for (int index = 0; index < markerBytes.Length; index += 1)
                {
                    if (foundMarker[index] != markerBytes[index])
                    {
                        throw new InvalidDataException("Installatiepakket is beschadigd.");
                    }
                }

                long digestPosition = markerPosition - digestLength;
                long payloadStart = digestPosition - payloadLength;
                if (payloadStart < 0)
                {
                    throw new InvalidDataException("Installatiepakket is beschadigd.");
                }

                byte[] expectedDigest = new byte[digestLength];
                source.Seek(digestPosition, SeekOrigin.Begin);
                ReadExactly(source, expectedDigest, digestLength);

                source.Seek(payloadStart, SeekOrigin.Begin);
                using (SHA256 sha = SHA256.Create())
                using (FileStream target = new FileStream(
                    destination, FileMode.Create, FileAccess.Write, FileShare.None))
                {
                    byte[] buffer = new byte[1024 * 1024];
                    long remaining = payloadLength;
                    while (remaining > 0)
                    {
                        int chunk = (int)Math.Min(buffer.Length, remaining);
                        int read = source.Read(buffer, 0, chunk);
                        if (read <= 0) throw new EndOfStreamException("Installatiepakket is onvolledig.");
                        target.Write(buffer, 0, read);
                        sha.TransformBlock(buffer, 0, read, null, 0);
                        remaining -= read;
                    }
                    sha.TransformFinalBlock(new byte[0], 0, 0);

                    byte[] actualDigest = sha.Hash;
                    for (int index = 0; index < digestLength; index += 1)
                    {
                        if (actualDigest[index] != expectedDigest[index])
                        {
                            throw new InvalidDataException(
                                "De inhoud van het installatiepakket klopt niet (beschadigd bestand).");
                        }
                    }
                }
            }
        }

        private static void ReadExactly(Stream stream, byte[] buffer, int count)
        {
            int read = 0;
            while (read < count)
            {
                int chunk = stream.Read(buffer, read, count - read);
                if (chunk <= 0) throw new EndOfStreamException("Installatiepakket is onvolledig.");
                read += chunk;
            }
        }
    }

    internal sealed class SetupForm : Form
    {
        private readonly TextBox pathBox = new TextBox();
        private readonly CheckBox desktopBox = new CheckBox();
        private readonly CheckBox startBox = new CheckBox();
        private readonly Button installButton = new Button();
        private readonly Button browseButton = new Button();
        private readonly ProgressBar progress = new ProgressBar();
        private readonly Label statusLabel = new Label();

        public SetupForm(string installDir)
        {
            Text = "RoomCraft NL " + AppVersion.Value + " installeren";
            ClientSize = new Size(560, 330);
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            MinimizeBox = false;
            StartPosition = FormStartPosition.CenterScreen;
            BackColor = Color.FromArgb(22, 19, 15);
            ForeColor = Color.FromArgb(238, 230, 218);
            Font = new Font("Segoe UI", 9F);

            Label title = new Label();
            title.Text = "RoomCraft NL";
            title.Font = new Font("Segoe UI Semibold", 18F);
            title.AutoSize = true;
            title.Location = new Point(20, 18);
            Controls.Add(title);

            Label versionLabel = new Label();
            versionLabel.Text = "versie " + AppVersion.Value;
            versionLabel.AutoSize = false;
            versionLabel.Size = new Size(160, 22);
            versionLabel.TextAlign = ContentAlignment.TopRight;
            versionLabel.Location = new Point(378, 26);
            versionLabel.Anchor = AnchorStyles.Top | AnchorStyles.Right;
            versionLabel.ForeColor = Color.FromArgb(175, 165, 152);
            Controls.Add(versionLabel);

            Label subtitle = new Label();
            subtitle.Text = "Interieurplanner met 2D/3D, pasvormcheck en budget.\n" +
                "Alles draait lokaal op deze computer, inclusief database.";
            subtitle.AutoSize = true;
            subtitle.ForeColor = Color.FromArgb(175, 165, 152);
            subtitle.Location = new Point(22, 56);
            Controls.Add(subtitle);

            Label pathLabel = new Label();
            pathLabel.Text = "Installatiemap";
            pathLabel.AutoSize = true;
            pathLabel.Location = new Point(22, 112);
            Controls.Add(pathLabel);

            pathBox.Text = installDir;
            pathBox.Location = new Point(22, 132);
            pathBox.Size = new Size(430, 24);
            Controls.Add(pathBox);

            browseButton.Text = "Bladeren\u2026";
            browseButton.Location = new Point(458, 131);
            browseButton.Size = new Size(80, 26);
            browseButton.Click += delegate
            {
                using (FolderBrowserDialog dialog = new FolderBrowserDialog())
                {
                    dialog.Description = "Kies een map voor RoomCraft NL";
                    if (dialog.ShowDialog(this) == DialogResult.OK)
                    {
                        pathBox.Text = Path.Combine(dialog.SelectedPath, "RoomCraft NL");
                    }
                }
            };
            Controls.Add(browseButton);

            desktopBox.Text = "Snelkoppeling op het bureaublad";
            desktopBox.AutoSize = true;
            desktopBox.Checked = true;
            desktopBox.Location = new Point(22, 172);
            Controls.Add(desktopBox);

            startBox.Text = "RoomCraft nu starten";
            startBox.AutoSize = true;
            startBox.Checked = true;
            startBox.Location = new Point(22, 196);
            Controls.Add(startBox);

            progress.Location = new Point(22, 228);
            progress.Size = new Size(516, 18);
            Controls.Add(progress);

            statusLabel.Text = "Klaar om te installeren.";
            statusLabel.AutoSize = true;
            statusLabel.ForeColor = Color.FromArgb(175, 165, 152);
            statusLabel.Location = new Point(22, 254);
            Controls.Add(statusLabel);

            installButton.Text = "Installeren";
            installButton.Location = new Point(400, 282);
            installButton.Size = new Size(138, 32);
            installButton.Click += delegate { BeginInstall(); };
            Controls.Add(installButton);
        }

        private void BeginInstall()
        {
            if (installButton.Text == "Sluiten")
            {
                Close();
                return;
            }

            string dir;
            try
            {
                dir = Path.GetFullPath(pathBox.Text.Trim());
            }
            catch
            {
                MessageBox.Show(this, "Kies een geldige installatiemap.", "RoomCraft NL",
                    MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }
            if (dir.Length < 4)
            {
                MessageBox.Show(this, "Kies een geldige installatiemap.", "RoomCraft NL",
                    MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            pathBox.Enabled = false;
            browseButton.Enabled = false;
            desktopBox.Enabled = false;
            startBox.Enabled = false;
            installButton.Enabled = false;

            bool desktop = desktopBox.Checked;
            bool start = startBox.Checked;
            Thread worker = new Thread(delegate()
            {
                try
                {
                    Installer.Install(dir, desktop, false, SetStatus, SetProgress);
                    RunOnUi(delegate
                    {
                        SetStatus("RoomCraft NL is ge\u00efnstalleerd.");
                        installButton.Text = "Sluiten";
                        installButton.Enabled = true;
                        if (start)
                        {
                            Process.Start(Path.Combine(dir, "RoomCraft.exe"));
                            Close();
                        }
                    });
                }
                catch (Exception error)
                {
                    RunOnUi(delegate
                    {
                        SetStatus("Installatie mislukt.");
                        MessageBox.Show(this, error.Message, "Installatie mislukt",
                            MessageBoxButtons.OK, MessageBoxIcon.Error);
                        pathBox.Enabled = true;
                        browseButton.Enabled = true;
                        desktopBox.Enabled = true;
                        startBox.Enabled = true;
                        installButton.Enabled = true;
                    });
                }
            });
            worker.IsBackground = true;
            worker.Start();
        }

        private void SetStatus(string text)
        {
            RunOnUi(delegate { statusLabel.Text = text; });
        }

        private void SetProgress(int percent)
        {
            RunOnUi(delegate { progress.Value = Math.Max(0, Math.Min(100, percent)); });
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
}
