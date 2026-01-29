import React from 'react'
import { Trees } from 'lucide-react'

const Logo = ({ size = 'md' }) => {
  const sizes = {
    sm: 'text-xl',
    md: 'text-2xl',
    lg: 'text-3xl'
  }

  const iconSizes = {
    sm: 20,
    md: 24,
    lg: 32
  }

  return (
    <div className="flex items-center gap-2">
      <Trees className="text-forest-emerald" size={iconSizes[size]} />
      <span className={`${sizes[size]} font-bold bg-gradient-to-r from-forest-emerald to-forest-teal bg-clip-text text-transparent`}>
        Forest
      </span>
    </div>
  )
}

export default Logo
