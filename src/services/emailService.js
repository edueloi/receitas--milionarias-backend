import sgMail from "@sendgrid/mail";

const apiKey = process.env.SENDGRID_API_KEY;
const fromEmail = process.env.SENDGRID_FROM || "noreply@receitasmilionarias.com.br";
const fromName = process.env.SENDGRID_FROM_NAME || "Receitas Milionarias";

if (apiKey) {
  sgMail.setApiKey(apiKey);
} else {
  console.warn("[email] SENDGRID_API_KEY not set. Emails will not be sent.");
}

export async function sendEmail({ to, subject, html }) {
  if (!apiKey) return;
  const msg = {
    to,
    from: { email: fromEmail, name: fromName },
    subject,
    html,
  };
  await sgMail.send(msg);
}
