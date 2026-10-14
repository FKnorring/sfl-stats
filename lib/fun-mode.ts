"use client"

import { useEffect, useState } from "react"

const FUN_MODE_STORAGE_KEY = "sfl-stats-fun-mode"
const FUN_MODE_CHANGE_EVENT = "sfl-stats-fun-mode-change"

export function getFunMode(): boolean {
  try {
    return localStorage.getItem(FUN_MODE_STORAGE_KEY) === "true"
  } catch (error) {
    console.error("[settings] Could not read fun mode:", error)
    return false
  }
}

export function setFunMode(enabled: boolean) {
  try {
    localStorage.setItem(FUN_MODE_STORAGE_KEY, String(enabled))
  } catch (error) {
    console.error("[settings] Could not save fun mode:", error)
  }
  window.dispatchEvent(
    new CustomEvent(FUN_MODE_CHANGE_EVENT, { detail: enabled })
  )
}

export function useFunMode(): boolean {
  const [funMode, setFunModeState] = useState(false)

  useEffect(() => {
    const updateFromStorage = () => setFunModeState(getFunMode())
    const updateFromChange = (event: Event) => {
      if (event instanceof CustomEvent && typeof event.detail === "boolean") {
        setFunModeState(event.detail)
      }
    }

    updateFromStorage()
    window.addEventListener("storage", updateFromStorage)
    window.addEventListener(FUN_MODE_CHANGE_EVENT, updateFromChange)
    return () => {
      window.removeEventListener("storage", updateFromStorage)
      window.removeEventListener(FUN_MODE_CHANGE_EVENT, updateFromChange)
    }
  }, [])

  return funMode
}
