import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  averageTicket,
  extraCountByService,
  itemGroup,
  productMargin,
  revenueByGroup,
  ticketByGroup,
  type ReportItem,
} from "./reports";

const svc = (
  totalCents: number,
  serviceCategory: "MAIN" | "EXTRA",
  serviceId = serviceCategory === "MAIN" ? "corte" : "sobrancelha",
  quantity = 1,
): ReportItem => ({ serviceId, productId: null, serviceCategory, quantity, totalCents, unitCostCents: null });

const prod = (totalCents: number, unitCostCents: number | null, quantity = 1, productId = "pomada"): ReportItem => ({
  serviceId: null,
  productId,
  serviceCategory: null,
  quantity,
  totalCents,
  unitCostCents,
});

const ZERO = { serviceCents: 0, extraCents: 0, productCents: 0, unclassifiedCents: 0, grossCents: 0 };

describe("revenueByGroup", () => {
  test("lista vazia → tudo zero", () => {
    assert.deepEqual(revenueByGroup([]), ZERO);
  });

  test("quebra em 3 grupos e bruto = soma (nunca digitado)", () => {
    const g = revenueByGroup([svc(4000, "MAIN"), svc(1500, "EXTRA"), prod(3500, 1750), svc(7000, "MAIN", "relaxamento")]);
    assert.deepEqual(g, { serviceCents: 11000, extraCents: 1500, productCents: 3500, unclassifiedCents: 0, grossCents: 16000 });
  });

  test("bruto inclui produto (erro da planilha: =SUM(C:D) esquecia o produto)", () => {
    assert.equal(revenueByGroup([svc(4000, "MAIN"), prod(3500, null)]).grossCents, 7500);
  });

  test("visitas a classificar entram no bruto, separadas dos 3 grupos", () => {
    const g = revenueByGroup([svc(4000, "MAIN")], 5000);
    assert.deepEqual(g, { serviceCents: 4000, extraCents: 0, productCents: 0, unclassifiedCents: 5000, grossCents: 9000 });
  });

  test("só visitas a classificar (nenhum item)", () => {
    assert.deepEqual(revenueByGroup([], 6500), { ...ZERO, unclassifiedCents: 6500, grossCents: 6500 });
  });
});

describe("averageTicket", () => {
  test("0 visitas → 0 (planilha dava #DIV/0!)", () => {
    assert.equal(averageTicket(0, 0), 0);
    assert.equal(averageTicket(5000, 0), 0);
  });

  test("arredonda para o centavo", () => {
    assert.equal(averageTicket(10000, 3), 3333);
    assert.equal(averageTicket(20000, 3), 6667);
  });

  test("ticket do mês = bruto do mês / visitas do mês, não média dos tickets diários", () => {
    // dia 1: 1 visita de R$ 100 · dia 2: 9 visitas somando R$ 450
    const mediaDosDiarios = (averageTicket(10000, 1) + averageTicket(45000, 9)) / 2;
    assert.equal(mediaDosDiarios, 7500); // R$ 75: errado
    assert.equal(averageTicket(55000, 10), 5500); // R$ 55: correto
  });
});

describe("ticketByGroup", () => {
  test("cada grupo dividido pelas visitas", () => {
    const g = revenueByGroup([svc(4000, "MAIN"), svc(1500, "EXTRA"), svc(4000, "MAIN"), prod(3500, 1750)]);
    assert.deepEqual(ticketByGroup(g, 2), {
      generalCents: 6500,
      serviceCents: 4000,
      extraCents: 750,
      productCents: 1750,
      unclassifiedCents: 0,
    });
  });

  test("0 visitas → tudo 0", () => {
    assert.deepEqual(ticketByGroup(revenueByGroup([]), 0), {
      generalCents: 0,
      serviceCents: 0,
      extraCents: 0,
      productCents: 0,
      unclassifiedCents: 0,
    });
  });

  test("grupos arredondados separadamente podem diferir do geral em centavos", () => {
    const tk = ticketByGroup({ serviceCents: 50, extraCents: 50, productCents: 0, unclassifiedCents: 0, grossCents: 100 }, 3);
    assert.equal(tk.generalCents, 33);
    assert.equal(tk.serviceCents + tk.extraCents, 34); // 17 + 17: diferença de 1 centavo, documentada
  });

  test("visita só com produto conta como visita", () => {
    const tk = ticketByGroup(revenueByGroup([prod(3500, 1750)]), 1);
    assert.equal(tk.generalCents, 3500);
    assert.equal(tk.productCents, 3500);
  });

  test("visitas a classificar entram no ticket geral", () => {
    const tk = ticketByGroup(revenueByGroup([svc(4000, "MAIN")], 6000), 2);
    assert.equal(tk.generalCents, 5000);
    assert.equal(tk.serviceCents, 2000);
    assert.equal(tk.unclassifiedCents, 3000);
  });
});

describe("productMargin", () => {
  test("lista vazia → zero", () => {
    assert.deepEqual(productMargin([]), { revenueCents: 0, costCents: 0, marginCents: 0 });
  });

  test("venda - custo × quantidade; serviços ignorados", () => {
    assert.deepEqual(productMargin([prod(7000, 1750, 2), svc(4000, "MAIN")]), {
      revenueCents: 7000,
      costCents: 3500,
      marginCents: 3500,
    });
  });

  test("ignora produto sem custo (nem venda nem custo entram)", () => {
    assert.deepEqual(productMargin([prod(3500, 1750), prod(2500, null)]), {
      revenueCents: 3500,
      costCents: 1750,
      marginCents: 1750,
    });
  });

  test("todos os produtos sem custo → zero", () => {
    assert.deepEqual(productMargin([prod(2500, null), prod(2500, null)]), { revenueCents: 0, costCents: 0, marginCents: 0 });
  });

  test("custo 0 cadastrado entra (diferente de sem custo)", () => {
    assert.deepEqual(productMargin([prod(2500, 0)]), { revenueCents: 2500, costCents: 0, marginCents: 2500 });
  });

  test("margem pode ser negativa", () => {
    assert.equal(productMargin([prod(1000, 1500)]).marginCents, -500);
  });
});

test("extraCountByService soma quantity só dos extras", () => {
  const c = extraCountByService([
    svc(1500, "EXTRA"),
    svc(3000, "EXTRA", "sobrancelha", 2),
    svc(1500, "EXTRA", "nariz"),
    svc(4000, "MAIN"),
    prod(3500, null),
  ]);
  assert.deepEqual([...c], [["sobrancelha", 3], ["nariz", 1]]);
});

test("itemGroup rejeita item inconsistente", () => {
  assert.throws(() => itemGroup({ serviceId: null, productId: null, serviceCategory: null }), /exatamente um/);
  assert.throws(() => itemGroup({ serviceId: "a", productId: "b", serviceCategory: "MAIN" }), /exatamente um/);
  assert.throws(() => itemGroup({ serviceId: "a", productId: null, serviceCategory: null }), /sem categoria/);
});

test("entradas inválidas disparam erro", () => {
  assert.throws(() => averageTicket(10.5, 2));
  assert.throws(() => averageTicket(100, -1));
  assert.throws(() => revenueByGroup([svc(-100, "MAIN")]));
  assert.throws(() => revenueByGroup([], -1));
  assert.throws(() => productMargin([prod(1000, 1.5)]));
});
