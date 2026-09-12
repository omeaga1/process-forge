using System;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;
using Microsoft.Win32;

namespace ProcessForge
{
    static class Uninstaller
    {
        [STAThread]
        static void Main(string[] args)
        {
            DialogResult result = MessageBox.Show(
                "Are you sure you want to completely uninstall ProcessForge Industrial Twin Studio?",
                "Uninstall ProcessForge",
                MessageBoxButtons.YesNo,
                MessageBoxIcon.Question
            );

            if (result != DialogResult.Yes)
                return;

            try
            {
                // 1. Remove Desktop Shortcut
                string desktop = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
                string desktopShortcut = Path.Combine(desktop, "ProcessForge.lnk");
                if (File.Exists(desktopShortcut))
                {
                    try { File.Delete(desktopShortcut); } catch { }
                }

                // 2. Remove Start Menu Shortcut
                string startMenu = Environment.GetFolderPath(Environment.SpecialFolder.StartMenu);
                string programs = Path.Combine(startMenu, "Programs");
                string startShortcut = Path.Combine(programs, "ProcessForge.lnk");
                if (File.Exists(startShortcut))
                {
                    try { File.Delete(startShortcut); } catch { }
                }

                // 3. Remove Registry Key
                try
                {
                    using (RegistryKey key = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Uninstall", true))
                    {
                        if (key != null)
                        {
                            key.DeleteSubKeyTree("ProcessForge", false);
                        }
                    }
                }
                catch { }

                // 4. Schedule directory deletion via background cmd.exe process
                string installDir = AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\');
                ProcessStartInfo psi = new ProcessStartInfo
                {
                    FileName = "cmd.exe",
                    Arguments = string.Format("/c ping 127.0.0.1 -n 2 > nul & rmdir /s /q \"{0}\"", installDir),
                    WindowStyle = ProcessWindowStyle.Hidden,
                    CreateNoWindow = true
                };
                Process.Start(psi);

                MessageBox.Show(
                    "ProcessForge was successfully removed from your computer.",
                    "Uninstall Complete",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Information
                );
            }
            catch (Exception ex)
            {
                MessageBox.Show(
                    "Error during uninstallation: " + ex.Message,
                    "Uninstall Warning",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Warning
                );
            }
        }
    }
}
