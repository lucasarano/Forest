import React from 'react'
import { motion } from 'framer-motion'

const Button = ({
  children,
  onClick,
  variant = 'primary',
  type = 'button',
  className = '',
  disabled = false,
  fullWidth = false
}) => {
  const baseStyles = 'px-6 xl:px-8 py-3 xl:py-4 text-base xl:text-lg rounded-lg font-medium transition-all duration-100 disabled:opacity-50 disabled:cursor-not-allowed'

  const variants = {
    primary: 'bg-gradient-to-r from-forest-emerald to-forest-teal text-forest-darker hover:shadow-xl hover:shadow-forest-emerald/30 hover:brightness-110',
    secondary: 'bg-forest-card/70 backdrop-blur-sm border border-forest-border text-forest-light-gray hover:border-forest-emerald hover:text-forest-emerald hover:shadow-lg hover:shadow-forest-emerald/10',
    ghost: 'text-forest-light-gray hover:text-forest-emerald hover:bg-forest-card/50'
  }

  const widthClass = fullWidth ? 'w-full' : ''

  return (
    <motion.button
      whileHover={{ scale: disabled ? 1 : 1.02 }}
      whileTap={{ scale: disabled ? 1 : 0.98 }}
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${baseStyles} ${variants[variant]} ${widthClass} ${className}`}
    >
      {children}
    </motion.button>
  )
}

export default Button
