import subprocess

def send_system_notification(title: str, message: str):
    # Using PowerShell to show a balloon tip notification
    ps_code = f"""
    [void] [System.Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms')
    $icon = New-Object System.Windows.Forms.NotifyIcon
    $icon.Icon = [System.Drawing.SystemIcons]::Information
    $icon.BalloonTipTitle = '{title.replace("'", "''")}'
    $icon.BalloonTipText = '{message.replace("'", "''")}'
    $icon.Visible = $true
    $icon.ShowBalloonTip(10000)
    """
    try:
        subprocess.run(["powershell", "-Command", ps_code], capture_output=True, text=True, check=True)
        print("Notification triggered successfully!")
    except Exception as e:
        print(f"Failed to send native OS notification: {e}")

send_system_notification("Algo Trading Scanner", "Ini adalah notifikasi uji coba: Sinyal BUY terdeteksi!")
