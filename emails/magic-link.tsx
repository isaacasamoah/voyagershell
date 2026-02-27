import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Text,
  Button,
  Hr,
  Link,
  Preview,
} from '@react-email/components'
import { Tailwind } from '@react-email/tailwind'

interface MagicLinkEmailProps {
  url: string
  email?: string
}

const MONO_STACK = "'SFMono-Regular', 'Consolas', 'Liberation Mono', 'Menlo', monospace"

export const MagicLinkEmail = ({ url, email }: MagicLinkEmailProps) => (
  <Html>
    <Head />
    <Preview>Your Voyager Shell magic link is ready</Preview>
    <Tailwind>
      <Body
        className="m-0 p-0"
        style={{ backgroundColor: '#050505', fontFamily: MONO_STACK }}
      >
        <Container
          className="mx-auto py-12 px-6"
          style={{ maxWidth: '600px' }}
        >
          {/* Header */}
          <Section className="text-center mb-10">
            <Text
              className="text-xl font-bold m-0"
              style={{
                color: '#818cf8',
                letterSpacing: '0.2em',
                fontFamily: MONO_STACK,
              }}
            >
              VOYAGER_SHELL
            </Text>
          </Section>

          {/* Body */}
          <Section className="text-center mb-8">
            <Text
              className="text-2xl m-0"
              style={{ color: '#cbd5e1', fontFamily: MONO_STACK }}
            >
              Your magic link is ready.
            </Text>
          </Section>

          {/* CTA Button */}
          <Section className="text-center mb-10">
            <Button
              href={url}
              className="px-8 py-3 text-sm font-bold text-white rounded"
              style={{
                backgroundColor: '#6366f1',
                fontFamily: MONO_STACK,
                letterSpacing: '0.1em',
              }}
            >
              ENTER THE SHELL &rarr;
            </Button>
          </Section>

          {/* Fallback URL */}
          <Section className="text-center mb-10">
            <Text
              className="text-xs m-0 mb-2"
              style={{ color: '#64748b', fontFamily: MONO_STACK }}
            >
              Or paste this URL:
            </Text>
            <Link
              href={url}
              className="text-xs"
              style={{
                color: '#64748b',
                fontFamily: MONO_STACK,
                wordBreak: 'break-all',
              }}
            >
              {url}
            </Link>
          </Section>

          {/* Divider */}
          <Hr style={{ borderColor: '#1e293b', margin: '0 0 24px 0' }} />

          {/* Footer */}
          <Section className="text-center">
            <Text
              className="text-xs m-0"
              style={{ color: '#475569', fontFamily: MONO_STACK, lineHeight: '1.6' }}
            >
              This link expires in 1 hour.
              <br />
              If you didn&apos;t request this, ignore this email.
            </Text>
          </Section>
        </Container>
      </Body>
    </Tailwind>
  </Html>
)

// Plain-text fallback for email clients that don't render HTML
export const text = ({ url }: MagicLinkEmailProps) =>
  `VOYAGER_SHELL\n\nYour magic link is ready.\n\nEnter the shell: ${url}\n\nThis link expires in 1 hour.\nIf you didn't request this, ignore this email.`
