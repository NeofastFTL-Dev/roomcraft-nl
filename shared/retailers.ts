import type { RetailerStatus } from './types';

/**
 * Retailer connectors RoomCraft knows about.
 *
 * The list lives in `shared/` so the server (feed sync) and the offline app
 * (catalog filter) show the same shops. A connector is only `configured` when
 * the matching feed URL exists in the environment: RoomCraft ships no scraped
 * retailer data and no invented offers.
 */
export interface RetailerDefinition {
  id: string;
  name: string;
  /** Environment variable with the product-feed URL, e.g. BOL_FEED_URL. */
  feedUrlEnv: string;
  /** Optional bearer token for that feed. */
  apiKeyEnv: string;
  docsUrl: string;
  feed: RetailerStatus['feed'];
}

export const RETAILER_CATALOG_NOTE =
  'Live koppeling vereist een productfeed uit een handelsovereenkomst. Zonder feed toont RoomCraft alleen de gelabelde democatalogus.';

export const RETAILER_DEFINITIONS: RetailerDefinition[] = [
  {
    id: 'ikea_nl',
    name: 'IKEA Nederland',
    docsUrl: 'https://www.ikea.com/nl/nl/',
    feed: 'product-api',
    feedUrlEnv: 'IKEA_NL_FEED_URL',
    apiKeyEnv: 'IKEA_NL_API_KEY',
  },
  {
    id: 'bol',
    name: 'bol.com',
    docsUrl: 'https://www.bol.com/nl/nl/',
    feed: 'product-api',
    feedUrlEnv: 'BOL_FEED_URL',
    apiKeyEnv: 'BOL_API_KEY',
  },
  {
    id: 'leenbakker',
    name: 'Leen Bakker',
    docsUrl: 'https://www.leenbakker.nl/',
    feed: 'product-feed',
    feedUrlEnv: 'LEENBAKKER_FEED_URL',
    apiKeyEnv: 'LEENBAKKER_API_KEY',
  },
  {
    id: 'kwantum',
    name: 'Kwantum',
    docsUrl: 'https://www.kwantum.nl/',
    feed: 'product-feed',
    feedUrlEnv: 'KWANTUM_FEED_URL',
    apiKeyEnv: 'KWANTUM_API_KEY',
  },
  {
    id: 'praxis',
    name: 'Praxis',
    docsUrl: 'https://www.praxis.nl/',
    feed: 'product-feed',
    feedUrlEnv: 'PRAXIS_FEED_URL',
    apiKeyEnv: 'PRAXIS_API_KEY',
  },
  {
    id: 'goossens',
    name: 'Goossens',
    docsUrl: 'https://www.goossens.nl/',
    feed: 'product-feed',
    feedUrlEnv: 'GOOSSENS_FEED_URL',
    apiKeyEnv: 'GOOSSENS_API_KEY',
  },
  {
    id: 'fonq',
    name: 'fonQ',
    docsUrl: 'https://www.fonq.nl/',
    feed: 'product-feed',
    feedUrlEnv: 'FONQ_FEED_URL',
    apiKeyEnv: 'FONQ_API_KEY',
  },
  {
    id: 'wehkamp',
    name: 'Wehkamp',
    docsUrl: 'https://www.wehkamp.nl/',
    feed: 'product-api',
    feedUrlEnv: 'WEHKAMP_FEED_URL',
    apiKeyEnv: 'WEHKAMP_API_KEY',
  },
  {
    id: 'hema',
    name: 'HEMA',
    docsUrl: 'https://www.hema.nl/',
    feed: 'product-feed',
    feedUrlEnv: 'HEMA_FEED_URL',
    apiKeyEnv: 'HEMA_API_KEY',
  },
  {
    id: 'blokker',
    name: 'Blokker',
    docsUrl: 'https://www.blokker.nl/',
    feed: 'product-feed',
    feedUrlEnv: 'BLOKKER_FEED_URL',
    apiKeyEnv: 'BLOKKER_API_KEY',
  },
  {
    id: 'seats_en_sofas',
    name: 'Seats and Sofas',
    docsUrl: 'https://www.seatsandsofas.nl/',
    feed: 'product-feed',
    feedUrlEnv: 'SEATS_EN_SOFAS_FEED_URL',
    apiKeyEnv: 'SEATS_EN_SOFAS_API_KEY',
  },
  {
    id: 'pronto_wonen',
    name: 'Pronto Wonen',
    docsUrl: 'https://www.prontowonen.nl/',
    feed: 'product-feed',
    feedUrlEnv: 'PRONTO_WONEN_FEED_URL',
    apiKeyEnv: 'PRONTO_WONEN_API_KEY',
  },
];
