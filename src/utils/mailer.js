import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'ap-south-1';
let sesClient;

function getSesClient() {
  if (!sesClient) sesClient = new SESClient({ region });
  return sesClient;
}

export async function sendOtpEmail(to, otp, purpose = 'login') {
  const subjects = {
    first_login: 'Eadronix Portal - Activate Your Account',
    reset_password: 'Eadronix Portal - Reset Your Password',
    login: 'Eadronix Portal - Your OTP Code',
  };

  const messages = {
    first_login: 'You are activating your Eadronix Portal account.',
    reset_password: 'You requested a password reset.',
    login: 'Use this OTP to log in.',
  };

  const subject = subjects[purpose] || subjects.login;
  const message = messages[purpose] || messages.login;
  const fromEmail = process.env.EMAIL_FROM || process.env.SES_FROM_EMAIL;
  const fromName = process.env.EMAIL_FROM_NAME || process.env.SES_FROM_NAME || 'Eadronix Portal';

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0d1117;font-family:'Segoe UI',Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0d1117;padding:40px 20px">
<tr><td align="center">
<table width="480" cellpadding="0" cellspacing="0" style="background:#161b22;border:1px solid #30363d;border-radius:16px;overflow:hidden;max-width:480px;width:100%;">
<tr><td style="background:linear-gradient(135deg,#00d4aa,#0099cc);padding:32px;text-align:center">
<h1 style="margin:0;font-size:22px;color:#0d1117;">Eadronix Portal</h1>
<p style="margin-top:8px;color:#0d1117;">Student Administration & Learning</p>
</td></tr>
<tr><td style="padding:36px 40px;">
<p style="color:#8b949e;font-size:13px;">YOUR ONE-TIME PASSWORD</p>
<p style="color:#e6edf3;font-size:15px;line-height:1.6;">${message}</p>
<div style="background:#0d1117;border:2px solid #00d4aa;border-radius:12px;padding:24px;text-align:center;margin-top:20px;margin-bottom:20px;">
<div style="font-size:42px;font-weight:bold;letter-spacing:8px;color:#00d4aa;font-family:Courier New;">${otp}</div>
<p style="color:#8b949e;font-size:12px;">Valid for 5 minutes</p>
</div>
<p style="color:#8b949e;font-size:12px;">If you did not request this OTP, simply ignore this email.</p>
</td></tr>
<tr><td style="padding:20px;text-align:center;color:#6e7681;font-size:11px;">Eadronix Portal</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  try {
    if (!fromEmail) throw new Error('EMAIL_FROM or SES_FROM_EMAIL is required for AWS SES.');
    await getSesClient().send(new SendEmailCommand({
      Source: `${fromName} <${fromEmail}>`,
      Destination: { ToAddresses: [to] },
      Message: {
        Subject: { Data: subject, Charset: 'UTF-8' },
        Body: { Html: { Data: html, Charset: 'UTF-8' } },
      },
    }));
    console.log('OTP email sent via AWS SES');
    return { sent: true };
  } catch (err) {
    console.error('AWS SES email error', err.message);
    return { sent: false, error: err.message };
  }
}
