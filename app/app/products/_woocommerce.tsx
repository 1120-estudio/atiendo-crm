"use client";
import * as React from "react";
import { useT } from "@/hooks/i18n/useT";
import { Button } from "@/components/ui/button";

type Estado = { url: string; enabled: boolean; processed: number; page: number; last_success_at: string | null; last_error: string | null };
export function ConexaoWooCommerce() {
  const t = useT();
  const [estado, setEstado] = React.useState<Estado | null>(null);
  const [mensagem, setMensagem] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [webhook, setWebhook] = React.useState<{ webhook_path: string; webhook_secret: string } | null>(null);
  const carregar = React.useCallback(async () => {
    try {
      const response = await fetch("/api/v1/integrations/woocommerce");
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message ?? "No se pudo leer la conexión.");
      setEstado(result.data);
    } catch (e) { setMensagem(e instanceof Error ? e.message : "Error de conexión."); }
  }, []);
  React.useEffect(() => { void carregar(); const timer = setInterval(() => void carregar(), 15000); return () => clearInterval(timer); }, [carregar]);
  async function guardar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setMensagem("");
    const form = e.currentTarget; const values = new FormData(form);
    try {
      const response = await fetch("/api/v1/integrations/woocommerce", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: values.get("url"), consumer_key: values.get("key"), consumer_secret: values.get("secret"), preservar_conteudo: values.get("preservar") === "on" }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message ?? "No se pudo guardar.");
      setWebhook(result.data); form.reset(); setMensagem("Conectada. La importación comienza en segundo plano."); await carregar();
    } catch (error) { setMensagem(error instanceof Error ? error.message : "Error de conexión."); }
    finally { setBusy(false); }
  }
  async function cambiarEstado() {
    setBusy(true);
    try {
      const response = await fetch("/api/v1/integrations/woocommerce", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: !estado?.enabled }) });
      if (!response.ok) throw new Error("No se pudo cambiar el estado.");
      await carregar();
    } catch (e) { setMensagem(e instanceof Error ? e.message : "Error."); }
    finally { setBusy(false); }
  }
  return <details className="mb-6 rounded-lg border p-4">
    <summary className="cursor-pointer font-medium">{t("WooCommerce · sincronizar catálogo")}</summary>
    <p className="my-3 text-sm">{t("Los productos nuevos se importan desactivados. Actívalos en el catálogo cuando autorices su uso por los agentes. WooCommerce controla precio y disponibilidad.")}</p>
    {estado && <div className="mb-3 text-sm">
      <p>{estado.url} · {estado.enabled ? t("Sincronización activa") : t("Pausada")}</p>
      <p>{t("Última sincronización completa:")} {estado.last_success_at ? new Date(estado.last_success_at).toLocaleString() : t("Pendiente")}{t("Página:")} {estado.page}{t("Productos procesados en este ciclo:")} {estado.processed}.</p>
      {estado.last_error && <p role="alert">Error: {estado.last_error}{t("Revisa la conexión; el sistema volverá a intentarlo.")}</p>}
      <Button type="button" disabled={busy} onClick={() => void cambiarEstado()}>{estado.enabled ? t("Pausar") : t("Reanudar y sincronizar")}</Button>
    </div>}
    <form onSubmit={guardar} className="grid gap-3">
      <label>{t("URL de la tienda")}<input name="url" type="url" required defaultValue={estado?.url} placeholder="https://example.com" className="block w-full rounded-md border p-2" /></label>
      <label>{t("Consumer key")}<input name="key" type="password" required autoComplete="off" className="block w-full rounded-md border p-2" /></label>
      <label>{t("Consumer secret")}<input name="secret" type="password" required autoComplete="off" className="block w-full rounded-md border p-2" /></label>
      <label><input name="preservar" type="checkbox" defaultChecked />{t(" Conservar las descripciones y fotos existentes de Orbit")}</label>
      <p className="text-sm">{t("Crea las claves con permiso de lectura en WooCommerce → Ajustes → Avanzado → API REST. Reconectar genera un nuevo secreto de webhook.")}</p>
      <Button disabled={busy} type="submit">{busy ? t("Guardando…") : t("Conectar WooCommerce")}</Button>
    </form>
    {mensagem && <p role="status" className="mt-3">{mensagem}</p>}
    {webhook && <div className="mt-3 break-all text-sm"><p>{t("Configura los webhooks de producto creado, actualizado y eliminado con esta URL:")}</p><code>{window.location.origin}{webhook.webhook_path}</code><p>{t("Secreto, visible solo ahora:")}</p><code>{webhook.webhook_secret}</code></div>}
  </details>;
}
