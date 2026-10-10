"use client";
import { createContext, useContext, type ReactNode } from "react";
const Contexto = createContext<string | null>(null);
export function RegiaoProvider({ pais, children }: { pais: string | null; children: ReactNode }) {
  return <Contexto.Provider value={pais}>{children}</Contexto.Provider>;
}
export function usePaisDaOrganizacao(): string | null {
  return useContext(Contexto);
}
