interface LogoProps {
  variant?: 'light' | 'dark'
  className?: string
}

const SRC: Record<'light' | 'dark', string> = {
  dark: '/vericlick-logo-dark.png',
  light: '/vericlick-logo-light.png',
}

export function Logo({ variant = 'dark', className }: LogoProps) {
  return (
    <img
      src={SRC[variant]}
      alt="VeriClick"
      className={className}
    />
  )
}

export function LogoMark({ variant = 'dark', className }: LogoProps) {
  return (
    <img
      src={SRC[variant]}
      alt="VeriClick"
      className={className}
    />
  )
}