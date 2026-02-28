// Pure HTML string templates — no React Email dependency.
// React Email's render() breaks in Next.js RSC webpack context.

const MONO_STACK = "'SFMono-Regular', 'Consolas', 'Liberation Mono', 'Menlo', monospace"

export const magicLinkHtml = (url: string): string => `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width" /></head>
<body style="margin:0;padding:0;background-color:#050505;font-family:${MONO_STACK};">
  <div style="max-width:600px;margin:0 auto;padding:48px 24px;">

    <!-- Header -->
    <div style="text-align:center;margin-bottom:24px;">
      <p style="margin:0;font-size:20px;font-weight:bold;color:#818cf8;letter-spacing:0.2em;font-family:${MONO_STACK};">
        VOYAGER
      </p>
    </div>

    <!-- Astronaut -->
    <div style="text-align:center;margin-bottom:24px;">
      <img src="https://voyagershell.vercel.app/images/astronaut/idle.png"
           alt="Voyager astronaut"
           width="120"
           style="display:inline-block;width:120px;height:auto;" />
    </div>

    <!-- Body -->
    <div style="text-align:center;margin-bottom:32px;">
      <p style="margin:0;font-size:24px;color:#cbd5e1;font-family:${MONO_STACK};">
        Your magic link is ready.
      </p>
    </div>

    <!-- CTA Button -->
    <div style="text-align:center;margin-bottom:40px;">
      <a href="${url}"
         style="display:inline-block;padding:12px 32px;font-size:14px;font-weight:bold;color:#ffffff;background-color:#6366f1;border-radius:4px;text-decoration:none;letter-spacing:0.1em;font-family:${MONO_STACK};">
        LAUNCH &rarr;
      </a>
    </div>

    <!-- Fallback URL -->
    <div style="text-align:center;margin-bottom:40px;">
      <p style="margin:0 0 8px 0;font-size:12px;color:#64748b;font-family:${MONO_STACK};">
        Or paste this URL:
      </p>
      <a href="${url}"
         style="font-size:12px;color:#64748b;font-family:${MONO_STACK};word-break:break-all;">
        ${url}
      </a>
    </div>

    <!-- Divider -->
    <hr style="border:none;border-top:1px solid #1e293b;margin:0 0 24px 0;" />

    <!-- Footer -->
    <div style="text-align:center;">
      <p style="margin:0;font-size:12px;color:#475569;font-family:${MONO_STACK};line-height:1.6;">
        This link expires in 1 hour.<br />
        If you didn&apos;t request this, ignore this email.
      </p>
    </div>

  </div>
</body>
</html>`

export const magicLinkText = (url: string): string =>
  `VOYAGER\n\nYour magic link is ready.\n\nLaunch: ${url}\n\nThis link expires in 1 hour.\nIf you didn't request this, ignore this email.`

// Voyage invite email — same visual language, personalized copy
export const inviteEmailHtml = (url: string, voyageName: string, inviterName: string): string => `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width" /></head>
<body style="margin:0;padding:0;background-color:#050505;font-family:${MONO_STACK};">
  <div style="max-width:600px;margin:0 auto;padding:48px 24px;">

    <!-- Header -->
    <div style="text-align:center;margin-bottom:24px;">
      <p style="margin:0;font-size:20px;font-weight:bold;color:#818cf8;letter-spacing:0.2em;font-family:${MONO_STACK};">
        VOYAGER
      </p>
    </div>

    <!-- Astronaut -->
    <div style="text-align:center;margin-bottom:24px;">
      <img src="https://voyagershell.vercel.app/images/astronaut/idle.png"
           alt="Voyager astronaut"
           width="120"
           style="display:inline-block;width:120px;height:auto;" />
    </div>

    <!-- Body -->
    <div style="text-align:center;margin-bottom:32px;">
      <p style="margin:0;font-size:24px;color:#cbd5e1;font-family:${MONO_STACK};">
        ${inviterName} invited you to
      </p>
      <p style="margin:8px 0 0 0;font-size:28px;font-weight:bold;color:#ffffff;font-family:${MONO_STACK};">
        ${voyageName}
      </p>
    </div>

    <!-- CTA Button -->
    <div style="text-align:center;margin-bottom:40px;">
      <a href="${url}"
         style="display:inline-block;padding:12px 32px;font-size:14px;font-weight:bold;color:#ffffff;background-color:#6366f1;border-radius:4px;text-decoration:none;letter-spacing:0.1em;font-family:${MONO_STACK};">
        LAUNCH &rarr;
      </a>
    </div>

    <!-- Fallback URL -->
    <div style="text-align:center;margin-bottom:40px;">
      <p style="margin:0 0 8px 0;font-size:12px;color:#64748b;font-family:${MONO_STACK};">
        Or paste this URL:
      </p>
      <a href="${url}"
         style="font-size:12px;color:#64748b;font-family:${MONO_STACK};word-break:break-all;">
        ${url}
      </a>
    </div>

    <!-- Divider -->
    <hr style="border:none;border-top:1px solid #1e293b;margin:0 0 24px 0;" />

    <!-- Footer -->
    <div style="text-align:center;">
      <p style="margin:0;font-size:12px;color:#475569;font-family:${MONO_STACK};line-height:1.6;">
        This link expires in 1 hour.<br />
        If you didn&apos;t expect this, you can safely ignore it.
      </p>
    </div>

  </div>
</body>
</html>`

export const inviteEmailText = (url: string, voyageName: string, inviterName: string): string =>
  `VOYAGER\n\n${inviterName} invited you to ${voyageName}.\n\nLaunch: ${url}\n\nThis link expires in 1 hour.\nIf you didn't expect this, you can safely ignore it.`
