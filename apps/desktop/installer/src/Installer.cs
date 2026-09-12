using System;
using System.ComponentModel;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;

namespace ProcessForge
{
    public class InstallerForm : Form
    {
        private Label lblTitle;
        private Label lblSubtitle;
        private Label lblStatus;
        private ProgressBar progressBar;
        private BackgroundWorker worker;

        public InstallerForm()
        {
            InitializeComponent();
            StartInstallation();
        }

        private void InitializeComponent()
        {
            this.Text = "ProcessForge Setup";
            this.Size = new Size(540, 260);
            this.StartPosition = FormStartPosition.CenterScreen;
            this.FormBorderStyle = FormBorderStyle.FixedDialog;
            this.MaximizeBox = false;
            this.MinimizeBox = false;
            this.BackColor = Color.FromArgb(11, 15, 16); // Osaka Jade Base
            this.ForeColor = Color.FromArgb(243, 244, 246);

            // Title Label
            lblTitle = new Label();
            lblTitle.Text = "ProcessForge";
            lblTitle.Font = new Font("Segoe UI", 18, FontStyle.Bold);
            lblTitle.ForeColor = Color.FromArgb(16, 185, 129); // Osaka Jade Glow
            lblTitle.Location = new Point(28, 24);
            lblTitle.AutoSize = true;
            this.Controls.Add(lblTitle);

            // Subtitle Label
            lblSubtitle = new Label();
            lblSubtitle.Text = "Industrial Digital Twin Studio — Automated Setup";
            lblSubtitle.Font = new Font("Segoe UI", 10, FontStyle.Regular);
            lblSubtitle.ForeColor = Color.FromArgb(156, 163, 175);
            lblSubtitle.Location = new Point(30, 62);
            lblSubtitle.AutoSize = true;
            this.Controls.Add(lblSubtitle);

            // Progress Bar
            progressBar = new ProgressBar();
            progressBar.Location = new Point(32, 110);
            progressBar.Size = new Size(460, 22);
            progressBar.Style = ProgressBarStyle.Continuous;
            this.Controls.Add(progressBar);

            // Status Label
            lblStatus = new Label();
            lblStatus.Text = "Initializing installation...";
            lblStatus.Font = new Font("Segoe UI", 9, FontStyle.Regular);
            lblStatus.ForeColor = Color.FromArgb(209, 213, 219);
            lblStatus.Location = new Point(32, 142);
            lblStatus.Size = new Size(460, 40);
            this.Controls.Add(lblStatus);

            // Background Worker
            worker = new BackgroundWorker();
            worker.WorkerReportsProgress = true;
            worker.DoWork += Worker_DoWork;
            worker.ProgressChanged += Worker_ProgressChanged;
            worker.RunWorkerCompleted += Worker_RunWorkerCompleted;
        }

        private void StartInstallation()
        {
            this.Shown += (s, e) => worker.RunWorkerAsync();
        }

        private void Worker_ProgressChanged(object sender, ProgressChangedEventArgs e)
        {
            progressBar.Value = Math.Min(100, Math.Max(0, e.ProgressPercentage));
            if (e.UserState != null)
            {
                lblStatus.Text = e.UserState.ToString();
            }
        }

        private void Worker_DoWork(object sender, DoWorkEventArgs e)
        {
            worker.ReportProgress(10, "Locating installation environment...");
            Thread.Sleep(300);

            string localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            string installDir = Path.Combine(localAppData, "ProcessForge");

            if (!Directory.Exists(installDir))
            {
                Directory.CreateDirectory(installDir);
            }

            worker.ReportProgress(25, "Extracting ProcessForge Studio files...");

            // Extract embedded payload.zip resource
            Assembly assembly = Assembly.GetExecutingAssembly();
            using (Stream resourceStream = assembly.GetManifestResourceStream("payload.zip"))
            {
                if (resourceStream == null)
                {
                    throw new Exception("Installation payload could not be found within the installer package.");
                }

                using (ZipArchive archive = new ZipArchive(resourceStream, ZipArchiveMode.Read))
                {
                    int total = archive.Entries.Count;
                    int current = 0;

                    foreach (ZipArchiveEntry entry in archive.Entries)
                    {
                        string destinationPath = Path.GetFullPath(Path.Combine(installDir, entry.FullName));
                        if (!destinationPath.StartsWith(installDir, StringComparison.OrdinalIgnoreCase))
                        {
                            throw new Exception("Invalid entry path detected in package.");
                        }

                        if (string.IsNullOrEmpty(entry.Name))
                        {
                            // Directory entry
                            Directory.CreateDirectory(destinationPath);
                        }
                        else
                        {
                            string dir = Path.GetDirectoryName(destinationPath);
                            if (!Directory.Exists(dir))
                            {
                                Directory.CreateDirectory(dir);
                            }
                            entry.ExtractToFile(destinationPath, true);
                        }

                        current++;
                        int percent = 25 + (int)((current / (double)total) * 45.0);
                        worker.ReportProgress(percent, string.Format("Extracting: {0}...", entry.Name));
                    }
                }
            }

            worker.ReportProgress(75, "Creating Desktop and Start Menu shortcuts...");
            Thread.Sleep(200);

            string exePath = Path.Combine(installDir, "ProcessForge.exe");
            string iconPath = Path.Combine(installDir, "icon.ico");
            if (!File.Exists(iconPath))
            {
                iconPath = exePath;
            }

            // Create Desktop Shortcut via WScript.Shell
            try
            {
                string desktopDir = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
                string desktopLink = Path.Combine(desktopDir, "ProcessForge.lnk");
                CreateShortcut(desktopLink, exePath, installDir, iconPath, "ProcessForge — Industrial Digital Twin Studio");
            }
            catch { }

            // Create Start Menu Shortcut
            try
            {
                string startMenuDir = Environment.GetFolderPath(Environment.SpecialFolder.StartMenu);
                string programsDir = Path.Combine(startMenuDir, "Programs");
                string startLink = Path.Combine(programsDir, "ProcessForge.lnk");
                CreateShortcut(startLink, exePath, installDir, iconPath, "ProcessForge — Industrial Digital Twin Studio");
            }
            catch { }

            worker.ReportProgress(90, "Configuring Windows application registration...");
            Thread.Sleep(200);

            // Register in Windows Add/Remove Programs (Registry)
            try
            {
                using (RegistryKey parent = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Uninstall", true))
                {
                    if (parent != null)
                    {
                        using (RegistryKey key = parent.CreateSubKey("ProcessForge"))
                        {
                            if (key != null)
                            {
                                key.SetValue("DisplayName", "ProcessForge — Industrial Twin Studio");
                                key.SetValue("DisplayVersion", "0.1.0");
                                key.SetValue("Publisher", "ProcessForge Engineering");
                                key.SetValue("DisplayIcon", string.Format("\"{0}\",0", iconPath));
                                key.SetValue("InstallLocation", installDir);
                                key.SetValue("UninstallString", string.Format("\"{0}\"", Path.Combine(installDir, "Uninstall.exe")));
                                key.SetValue("NoModify", 1, RegistryValueKind.DWord);
                                key.SetValue("NoRepair", 1, RegistryValueKind.DWord);
                            }
                        }
                    }
                }
            }
            catch { }

            worker.ReportProgress(100, "Installation complete! Launching ProcessForge...");
            Thread.Sleep(500);

            // Launch the application
            try
            {
                ProcessStartInfo psi = new ProcessStartInfo
                {
                    FileName = exePath,
                    WorkingDirectory = installDir
                };
                Process.Start(psi);
            }
            catch { }

            Thread.Sleep(1000);
        }

        private void Worker_RunWorkerCompleted(object sender, RunWorkerCompletedEventArgs e)
        {
            if (e.Error != null)
            {
                MessageBox.Show(
                    "Installation failed:\n" + e.Error.Message,
                    "ProcessForge Installation Error",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error
                );
            }
            this.Close();
        }

        private static void CreateShortcut(string shortcutPath, string targetPath, string workingDir, string iconLocation, string description)
        {
            Type shellType = Type.GetTypeFromProgID("WScript.Shell");
            if (shellType == null) return;
            dynamic shell = Activator.CreateInstance(shellType);
            dynamic shortcut = shell.CreateShortcut(shortcutPath);
            shortcut.TargetPath = targetPath;
            shortcut.WorkingDirectory = workingDir;
            shortcut.Description = description;
            shortcut.IconLocation = string.Format("{0},0", iconLocation);
            shortcut.Save();
        }

        [STAThread]
        static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new InstallerForm());
        }
    }
}
