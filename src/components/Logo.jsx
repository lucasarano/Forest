import React from 'react'
import { Link } from 'react-router-dom'
import { Trees } from 'lucide-react'

const Logo = ({ size = 'md', clickable = false }) => {
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

  const content = (
    <div className="flex items-center gap-2">
      <Trees className="text-forest-emerald" size={iconSizes[size]} />
      <span className={`${sizes[size]} font-bold bg-gradient-to-r from-forest-emerald to-forest-teal bg-clip-text text-transparent`}>
        Forest
      </span>
    </div>
  )

  if (clickable) {
    return (
      <Link to="/" className="hover:opacity-80 transition-opacity duration-75">
        {content}
      </Link>
    )
  }

  return content
}

export default Logo
