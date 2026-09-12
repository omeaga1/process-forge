using System;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;

namespace ProcessForge
{
    static class Launcher
    {
        [STAThread]
        static void Main()
        {
            try
            {
                string baseDir = AppDomain.CurrentDomain.BaseDirectory;
                string htmlPath = Path.Combine(baseDir, "app", "index.html");

                if (!File.Exists(htmlPath))
                {
                    string localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
                    string altPath = Path.Combine(localAppData, "ProcessForge", "app", "index.html");
                    if (File.Exists(altPath))
                    {
                        htmlPath = altPath;
                    }
                }

                if (!File.Exists(htmlPath))
                {
                    MessageBox.Show(
                        "ProcessForge application assets could not be located at:\n" + htmlPath +
                        "\n\nPlease reinstall ProcessForge using ProcessForge-Setup-x64.exe.",
                        "ProcessForge — Missing Assets",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Error
                    );
                    return;
                }

                string fileUrl = new Uri(htmlPath).AbsoluteUri;

                // Priority 1: Launch via Microsoft Edge in dedicated standalone app-window mode
                // (No browser tabs, no address bar, hardware accelerated, native feel)
                string edgePath = @"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe";
                if (!File.Exists(edgePath))
                {
                    edgePath = @"C:\Program Files\Microsoft\Edge\Application\msedge.exe";
                }

                if (File.Exists(edgePath))
                {
                    ProcessStartInfo psi = new ProcessStartInfo
                    {
                        FileName = edgePath,
                        Arguments = string.Format("--app=\"{0}\" --window-size=1440,900", fileUrl),
                        UseShellExecute = false
                    };
                    Process.Start(psi);
                }
                else
                {
                    // Priority 2: System default browser fallback
                    ProcessStartInfo psi = new ProcessStartInfo
                    {
                        FileName = fileUrl,
                        UseShellExecute = true
                    };
                    Process.Start(psi);
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show(
                    "Error launching ProcessForge:\n" + ex.Message,
                    "ProcessForge Launch Failure",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error
                );
            }
        }
    }
}
