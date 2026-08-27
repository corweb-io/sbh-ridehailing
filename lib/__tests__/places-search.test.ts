import { afterEach, describe, expect, it, vi } from "vitest";
import { placeChoiceButtons } from "../chat/booker";
import { outboundToWhatsApp } from "../chat/whatsapp";
import {
  customPlace,
  hydratePlaceSuggestion,
  resolveTypedPlaceQuery,
  searchPlaces,
} from "../places-search";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("resolveTypedPlaceQuery", () => {
  it("accepts an exact catalog name without calling Google", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await resolveTypedPlaceQuery("Gustavia");
    expect(result).toEqual({
      kind: "place",
      place: expect.objectContaining({
        name: "Gustavia",
        source: "catalog",
        lat: expect.any(Number),
        lng: expect.any(Number),
      }),
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("asks the booker to pick when several catalog names match", async () => {
    vi.stubEnv("GOOGLE_MAPS_API_KEY", "");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => [],
      })),
    );
    const result = await resolveTypedPlaceQuery("Beach");
    expect(result.kind).toBe("choices");
    if (result.kind !== "choices") return;
    expect(result.choices.map((place) => place.name)).toEqual(
      expect.arrayContaining([
        "Shell Beach",
        "Saint-Jean Beach",
        "Colombier Beach",
      ]),
    );
  });

  it("keeps a free-text custom place when nothing matches", async () => {
    vi.stubEnv("GOOGLE_MAPS_API_KEY", "");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => [],
      })),
    );
    const result = await resolveTypedPlaceQuery("Villa secret 12");
    expect(result).toEqual({
      kind: "place",
      place: customPlace("Villa secret 12"),
    });
  });

  it("lets the booker confirm a unique Google prediction", async () => {
    vi.stubEnv("GOOGLE_MAPS_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        const url = String(input);
        if (url.includes("places:autocomplete")) {
          return {
            ok: true,
            json: async () => ({
              suggestions: [
                {
                  placePrediction: {
                    placeId: "ChIJVillaMarie",
                    text: { text: "Villa Marie, Saint-Barthélemy" },
                    structuredFormat: {
                      mainText: { text: "Villa Marie" },
                      secondaryText: { text: "Saint-Jean, Saint-Barthélemy" },
                    },
                  },
                },
              ],
            }),
          };
        }
        throw new Error(`unexpected fetch ${url}`);
      }),
    );

    const result = await resolveTypedPlaceQuery("Villa Marie", {
      sessionToken: "sessiontoken1",
    });
    expect(result.kind).toBe("choices");
    if (result.kind !== "choices") return;
    expect(result.choices).toEqual([
      expect.objectContaining({
        name: "Villa Marie",
        placeId: "ChIJVillaMarie",
        source: "google",
      }),
    ]);
  });

  it("returns Google suggestions for the chat picker without putting place ids in buttons", async () => {
    vi.stubEnv("GOOGLE_MAPS_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          suggestions: [
            {
              placePrediction: {
                placeId: "ChIJOnePlaceIdThatWouldOverflowTelegramCallbackData",
                text: { text: "Villa One" },
                structuredFormat: {
                  mainText: { text: "Villa One" },
                  secondaryText: { text: "Lorient" },
                },
              },
            },
            {
              placePrediction: {
                placeId: "ChIJTwo",
                text: { text: "Villa Two" },
                structuredFormat: {
                  mainText: { text: "Villa Two" },
                  secondaryText: { text: "Lurin" },
                },
              },
            },
          ],
        }),
      })),
    );

    const result = await resolveTypedPlaceQuery("Villa");
    expect(result.kind).toBe("choices");
    if (result.kind !== "choices") return;
    const buttons = placeChoiceButtons(result.choices, result.query, "fr");
    const ids = buttons.flat().map((button) => button.id);
    expect(ids).toEqual(["pick:0", "pick:1", "pick:custom"]);
    expect(ids.every((id) => id.length <= 64)).toBe(true);
    expect(ids.some((id) => id.includes("ChIJ"))).toBe(false);
  });
});

describe("searchPlaces", () => {
  it("merges catalog hits ahead of Google predictions", async () => {
    vi.stubEnv("GOOGLE_MAPS_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          suggestions: [
            {
              placePrediction: {
                placeId: "ChIJEden",
                text: { text: "Eden Rock" },
                structuredFormat: {
                  mainText: { text: "Eden Rock" },
                  secondaryText: { text: "Saint-Jean" },
                },
              },
            },
            {
              placePrediction: {
                placeId: "ChIJNikki",
                text: { text: "Nikki Beach" },
                structuredFormat: {
                  mainText: { text: "Nikki Beach" },
                  secondaryText: { text: "Saint-Jean" },
                },
              },
            },
          ],
        }),
      })),
    );

    const places = await searchPlaces("Eden");
    expect(places[0]?.name).toBe("Eden Rock");
    expect(places[0]?.source).toBe("catalog");
    expect(places.some((place) => place.name === "Nikki Beach")).toBe(true);
  });
});

describe("hydratePlaceSuggestion", () => {
  it("returns catalog coordinates without a details round-trip", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const place = await hydratePlaceSuggestion({
      name: "Gustavia",
      address: "Gustavia, Saint-Barthélemy",
      lat: 17.8961,
      lng: -62.8498,
      source: "catalog",
      fareZone: "gustavia",
      placeId: "unused",
    });
    expect(place.source).toBe("catalog");
    expect(place.lat).toBe(17.8961);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("chat place picker", () => {
  it("sends WhatsApp a list when there are more than three matches", () => {
    const payload = outboundToWhatsApp({
      chatId: "590690000000",
      text: "Plusieurs lieux correspondent à « Villa ». Lequel ?",
      buttons: placeChoiceButtons(
        [
          {
            name: "Villa One",
            address: "Lorient",
            lat: null,
            lng: null,
            source: "google",
            placeId: "ChIJOne",
          },
          {
            name: "Villa Two",
            address: "Lurin",
            lat: null,
            lng: null,
            source: "google",
            placeId: "ChIJTwo",
          },
          {
            name: "Villa Three",
            address: "Toiny",
            lat: null,
            lng: null,
            source: "google",
            placeId: "ChIJThree",
          },
        ],
        "Villa",
        "fr",
      ),
    });
    expect(payload.type).toBe("interactive");
    expect(
      (payload as { interactive: { type: string } }).interactive.type,
    ).toBe("list");
  });
});
