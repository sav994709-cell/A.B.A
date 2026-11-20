export interface PasswordResetEmailPayload {
  to: string;
  nombre: string;
  resetUrl: string;
  expiresMinutes: number;
}

export interface SentEmailRecord {
  to: string;
  subject: string;
  resetUrl: string;
  sentAt: string;
  provider: 'resend' | 'dev-preview';
}

const devOutbox: SentEmailRecord[] = [];

export function getDevOutbox(): SentEmailRecord[] {
  return devOutbox;
}

export function clearDevOutbox(): void {
  devOutbox.length = 0;
}

export async function sendPasswordResetEmail(payload: PasswordResetEmailPayload): Promise<void> {
  const subject = 'Restablece tu contraseña en A.B.A.';
  const html = `
    <div style="font-family: 'Plus Jakarta Sans', Arial, sans-serif; color: #191c1e; max-width: 520px; margin: 0 auto;">
      <h2 style="color: #1e40af;">Recuperación de contraseña — A.B.A.</h2>
      <p>Hola ${payload.nombre},</p>
      <p>Recibimos una solicitud para restablecer la contraseña de tu cuenta en la Plataforma Educativa A.B.A.</p>
      <p>Este enlace es de <strong>un solo uso</strong> y caduca en <strong>${payload.expiresMinutes} minutos</strong>:</p>
      <p style="margin: 24px 0;">
        <a href="${payload.resetUrl}" style="background:#4f46e5;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600;">
          Definir nueva contraseña
        </a>
      </p>
      <p style="font-size: 13px; color: #444653;">Si no solicitaste este cambio, puedes ignorar este mensaje. Tu contraseña actual seguirá funcionando.</p>
    </div>
  `;

  const resendApiKey = process.env.RESEND_API_KEY;
  const mailFrom = process.env.MAIL_FROM || 'A.B.A. Plataforma Educativa <no-reply@aba.edu.co>';

  if (resendApiKey) {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: mailFrom,
        to: [payload.to],
        subject,
        html,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Error desconocido');
      console.error('Error enviando correo con Resend:', errorText);
    }
    return;
  }

  // Modo desarrollo / sandbox sin proveedor SMTP configurado
  devOutbox.unshift({
    to: payload.to,
    subject,
    resetUrl: payload.resetUrl,
    sentAt: new Date().toISOString(),
    provider: 'dev-preview',
  });
  if (devOutbox.length > 10) {
    devOutbox.length = 10;
  }

  if (process.env.NODE_ENV !== 'test') {
    console.info(`[A.B.A. Mail Preview] Para: ${payload.to} | Enlace de restablecimiento: ${payload.resetUrl}`);
  }
}
