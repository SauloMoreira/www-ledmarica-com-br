import { beforeEach, describe, expect, it } from "vitest";
import { activateMetaPixel } from "@/lib/metaPixel";
import { cartSnapshot, trackAddedSince, trackCartAdditions } from "@/lib/cartTracking";
import { useCart } from "@/stores/cartStore";
import { resetAll, grantMarketing, loadLibrary, sent } from "./helpers";

const PIXEL = "1144605414568984";
const line = (id: string, stock: number, price = 10) => ({
  productId: id,
  name: id,
  slug: id,
  price,
  image: null,
  stock,
});

describe("AddToCart com a quantidade efetivamente adicionada", () => {
  beforeEach(() => {
    resetAll();
    useCart.setState({ items: [] });
    grantMarketing();
    activateMetaPixel(PIXEL);
    loadLibrary();
    sent.length = 0;
  });

  it("estoque limita: pede 5, entram 2 → evento com 2", () => {
    const snap = cartSnapshot(["p1"]);
    useCart.getState().addItem(line("p1", 2), 5);
    trackAddedSince(snap, [{ productId: "p1", name: "p1", unitPrice: 10 }]);
    expect(sent[0][2]).toMatchObject({
      num_items: 2,
      value: 20,
      contents: [{ id: "p1", quantity: 2, item_price: 10 }],
    });
  });

  it("produto já no limite do estoque: nenhum AddToCart", () => {
    useCart.getState().addItem(line("p1", 2), 2);
    const snap = cartSnapshot(["p1"]);
    useCart.getState().addItem(line("p1", 2), 1);
    trackAddedSince(snap, [{ productId: "p1", name: "p1", unitPrice: 10 }]);
    expect(sent).toEqual([]);
  });

  it("combo/compra rápida: vários produtos num clique → UM evento com todos em contents", () => {
    trackCartAdditions(
      [
        { productId: "a", name: "A", unitPrice: 10 },
        { productId: "b", name: "B", unitPrice: 2.5 },
        { productId: "a", name: "A", unitPrice: 10 },
      ],
      () => {
        useCart.getState().addItem(line("a", 99), 2);
        useCart.getState().addItem(line("b", 99, 2.5), 4);
        useCart.getState().addItem(line("a", 99), 1);
      },
    );
    expect(sent.filter((a) => a[1] === "AddToCart")).toHaveLength(1);
    expect(sent[0][2]).toMatchObject({
      content_ids: ["a", "b"],
      contents: [
        { id: "a", quantity: 3, item_price: 10 },
        { id: "b", quantity: 4, item_price: 2.5 },
      ],
      num_items: 7,
      value: 40,
    });
  });
});
