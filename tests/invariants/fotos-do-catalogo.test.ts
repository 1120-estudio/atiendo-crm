import { describe, expect, it } from "vitest";

import { TAMANHO_MAXIMO_DA_FOTO } from "@/lib/catalogo/fotos";

import { lastLine, sql } from "./gov-helpers";

/**
 * AS FOTOS DO CATÁLOGO (migration 0390) — o que o banco promete à rota.
 *
 * A rota confere tamanho, tipo e quantidade antes de gravar; estes casos provam
 * que o banco diz o MESMO número. Dois tetos diferentes fariam a rota aceitar o
 * que o Storage recusa (e a tela mostraria "erro ao subir a foto"), ou o banco
 * aceitar pelo PostgREST o que a rota recusa.
 */

const ORG = "f0700390-0000-4000-8000-000000000001";

describe("catalog-photos — o bucket que o produto supõe", () => {
  it("existe PRIVADO, com o teto e os tipos de lib/catalogo/fotos.ts", () => {
    const linha = lastLine(
      sql(`select public::text || '|' || file_size_limit::text || '|' ||
                  coalesce(array_to_string(allowed_mime_types, ','), 'NULO')
             from storage.buckets where id = 'catalog-photos';`),
    );
    expect(linha).toBe(`false|${TAMANHO_MAXIMO_DA_FOTO}|image/jpeg,image/png,image/webp`);
  });

  it("NENHUMA policy de storage.objects nomeia o bucket — só o service_role lê e grava", () => {
    const policies = lastLine(
      sql(`select coalesce(string_agg(policyname, ',' order by policyname), 'NENHUMA')
             from pg_policies
            where schemaname = 'storage' and tablename = 'objects'
              and (coalesce(qual, '') || coalesce(with_check, '')) like '%catalog-photos%';`),
    );
    expect(policies).toBe("NENHUMA");
  });
});

describe("catalog_products.fotos — no máximo o que a tela deixa pôr", () => {
  it("preserva galerias com mais de cinco fotos", () => {
    expect(lastLine(sql(`
      insert into public.organizations (id, slug, legal_name, display_name)
      values ('${ORG}', 'fotos-0390', 'Fotos', 'Fotos') on conflict (id) do nothing;
      insert into public.catalog_products (organization_id, codigo, nome, preco_cents, fotos)
      values ('${ORG}', 'GALERIA', 'Galeria', 100, array_fill('foto.webp'::text, array[12]))
      on conflict (organization_id,codigo) do update set fotos=excluded.fotos;
      select cardinality(fotos) from public.catalog_products where organization_id='${ORG}' and codigo='GALERIA';
    `))).toBe("12");
  });

  it("produto que já existia nasce com a lista vazia, não nula", () => {
    const linha = lastLine(
      sql(`select column_default || '|' || is_nullable from information_schema.columns
            where table_schema = 'public' and table_name = 'catalog_products' and column_name = 'fotos';`),
    );
    expect(linha).toBe("'{}'::text[]|NO");
  });
});
