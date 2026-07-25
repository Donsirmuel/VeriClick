import type { SVGProps } from 'react'

interface LogoProps extends SVGProps<SVGSVGElement> {
  variant?: 'light' | 'dark'
}

export function Logo({ variant = 'dark', ...props }: LogoProps) {
  const fill = variant === 'light' ? '#ffffff' : '#000000'
  const accent = variant === 'light' ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.08)'

  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 46" fill="none" {...props}>
      <path
        fill={fill}
        d="M25.946 44.938c-.664.845-2.021.375-2.021-.698V33.937a2.26 2.26 0 0 0-2.262-2.262H10.287c-.92 0-1.456-1.04-.92-1.788l7.48-10.471c1.07-1.497 0-3.578-1.842-3.578H1.237c-.92 0-1.456-1.04-.92-1.788l7.48-10.471c.214-.297.556-.474.92-.474h28.894c.92 0 1.456 1.04.92 1.788l-7.48 10.471c-1.07 1.498 0 3.579 1.842 3.579h11.377c.943 0 1.473 1.088.89 1.83L25.947 44.94z"
      />
      <ellipse cx="5.508" cy="14.704" fill={accent} rx="5.508" ry="14.704" transform="matrix(.00324 1 1 -.00324 -4.47 31.516)" />
      <ellipse cx="10.399" cy="29.851" fill={accent} rx="10.399" ry="29.851" transform="matrix(.00324 1 1 -.00324 -39.328 7.883)" />
    </svg>
  )
}

export function LogoMark({ variant = 'dark', ...props }: LogoProps) {
  const fill = variant === 'light' ? '#ffffff' : '#000000'

  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 46" fill="none" {...props}>
      <path
        fill={fill}
        d="M25.946 44.938c-.664.845-2.021.375-2.021-.698V33.937a2.26 2.26 0 0 0-2.262-2.262H10.287c-.92 0-1.456-1.04-.92-1.788l7.48-10.471c1.07-1.497 0-3.578-1.842-3.578H1.237c-.92 0-1.456-1.04-.92-1.788l7.48-10.471c.214-.297.556-.474.92-.474h28.894c.92 0 1.456 1.04.92 1.788l-7.48 10.471c-1.07 1.498 0 3.579 1.842 3.579h11.377c.943 0 1.473 1.088.89 1.83L25.947 44.94z"
      />
    </svg>
  )
}
