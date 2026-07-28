// data.js — HELIVI — usa somente Supabase
"use strict";

(function () {
  if (typeof window.__heliviCreateSupabaseData !== "function") {
    throw new Error("data-supabase.js não foi carregado.");
  }

  const api = window.__heliviCreateSupabaseData();

  window.heliviData = api;
  window.data = api;

  console.log("[HELIVI] Data layer ativo — Supabase");
})();
