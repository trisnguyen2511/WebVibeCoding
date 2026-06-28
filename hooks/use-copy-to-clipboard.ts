'use client'
import { useState } from 'react'

export function useCopyToClipboard(delay = 1500) {
  const [copied, setCopied] = useState(false)

  const copy = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), delay)
  }

  return { copied, copy }
}
