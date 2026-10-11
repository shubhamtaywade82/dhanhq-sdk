import { exchangeSegmentForCode } from "../../constants";
import type {
  MarketDepthLevel,
  MarketDisconnectEvent,
  MarketFeedEvent,
  MarketFullEvent,
  MarketOiEvent,
  MarketPacketHeader,
  MarketPrevCloseEvent,
  MarketQuoteEvent,
  MarketTickerEvent,
  StoredSubscription,
} from "../../types/ws.types";

export function parseMarketFeedPacket(
  packet: Buffer,
  subscriptions: StoredSubscription[],
): MarketFeedEvent | null {
  if (packet.length < 8) {
    return null;
  }

  const header = parseHeader(packet, subscriptions);

  switch (header.responseCode) {
    case 2:
      return parseTicker(packet, header);
    case 4:
      return parseQuote(packet, header);
    case 5:
      return parseOi(packet, header);
    case 6:
      return parsePrevClose(packet, header);
    case 8:
      return parseFull(packet, header);
    case 7:
      return { ...header, type: "market-status", raw: packet };
    case 50:
      return parseDisconnect(packet, header);
    default:
      return null;
  }
}

function parseHeader(
  packet: Buffer,
  subscriptions: StoredSubscription[],
): MarketPacketHeader {
  const responseCode = packet.readUInt8(0);
  const messageLength = packet.readInt16LE(1);
  const exchangeSegmentCode = packet.readUInt8(3);
  const securityId = String(packet.readInt32LE(4));
  const exchangeSegment = resolveExchangeSegment(
    securityId,
    exchangeSegmentCode,
    subscriptions,
  );

  return {
    responseCode,
    messageLength,
    exchangeSegmentCode,
    exchangeSegment,
    securityId,
  };
}

function parseTicker(
  packet: Buffer,
  header: MarketPacketHeader,
): MarketTickerEvent | null {
  if (packet.length < 16) {
    return null;
  }

  return {
    ...header,
    type: "ticker",
    ltp: packet.readFloatLE(8),
    ltt: packet.readInt32LE(12),
    raw: packet,
  };
}

function parsePrevClose(
  packet: Buffer,
  header: MarketPacketHeader,
): MarketPrevCloseEvent | null {
  if (packet.length < 16) {
    return null;
  }

  return {
    ...header,
    type: "prev-close",
    previousClose: packet.readFloatLE(8),
    previousOpenInterest: packet.readInt32LE(12),
    raw: packet,
  };
}

function parseQuote(
  packet: Buffer,
  header: MarketPacketHeader,
): MarketQuoteEvent | null {
  if (packet.length < 50) {
    return null;
  }

  return {
    ...header,
    type: "quote",
    ltp: packet.readFloatLE(8),
    ltq: packet.readInt16LE(12),
    ltt: packet.readInt32LE(14),
    atp: packet.readFloatLE(18),
    volume: packet.readInt32LE(22),
    totalSellQuantity: packet.readInt32LE(26),
    totalBuyQuantity: packet.readInt32LE(30),
    dayOpen: packet.readFloatLE(34),
    dayClose: packet.readFloatLE(38),
    dayHigh: packet.readFloatLE(42),
    dayLow: packet.readFloatLE(46),
    raw: packet,
  };
}

function parseOi(
  packet: Buffer,
  header: MarketPacketHeader,
): MarketOiEvent | null {
  if (packet.length < 12) {
    return null;
  }

  return {
    ...header,
    type: "oi",
    openInterest: packet.readInt32LE(8),
    raw: packet,
  };
}

function parseFull(
  packet: Buffer,
  header: MarketPacketHeader,
): MarketFullEvent | null {
  if (packet.length < 162) {
    return null;
  }

  return {
    ...header,
    type: "full",
    ltp: packet.readFloatLE(8),
    ltq: packet.readInt16LE(12),
    ltt: packet.readInt32LE(14),
    atp: packet.readFloatLE(18),
    volume: packet.readInt32LE(22),
    totalSellQuantity: packet.readInt32LE(26),
    totalBuyQuantity: packet.readInt32LE(30),
    openInterest: packet.readInt32LE(34),
    highestOpenInterest: packet.readInt32LE(38),
    lowestOpenInterest: packet.readInt32LE(42),
    dayOpen: packet.readFloatLE(46),
    dayClose: packet.readFloatLE(50),
    dayHigh: packet.readFloatLE(54),
    dayLow: packet.readFloatLE(58),
    depth: parseDepth(packet, 62),
    raw: packet,
  };
}

function parseDisconnect(
  packet: Buffer,
  header: MarketPacketHeader,
): MarketDisconnectEvent | null {
  if (packet.length < 10) {
    return null;
  }

  return {
    ...header,
    type: "disconnect",
    reasonCode: packet.readInt16LE(8),
    raw: packet,
  };
}

function parseDepth(packet: Buffer, offset: number): MarketDepthLevel[] {
  const levels: MarketDepthLevel[] = [];

  for (let index = 0; index < 5; index += 1) {
    const start = offset + index * 20;
    levels.push({
      bidQuantity: packet.readInt32LE(start),
      askQuantity: packet.readInt32LE(start + 4),
      bidOrders: packet.readInt16LE(start + 8),
      askOrders: packet.readInt16LE(start + 10),
      bidPrice: packet.readFloatLE(start + 12),
      askPrice: packet.readFloatLE(start + 16),
    });
  }

  return levels;
}

function resolveExchangeSegment(
  securityId: string,
  exchangeSegmentCode: number,
  subscriptions: StoredSubscription[],
): string {
  const matches = subscriptions.filter(
    (subscription) => subscription.securityId === securityId,
  );

  if (matches.length === 1) {
    return matches[0].exchangeSegment;
  }

  return exchangeSegmentForCode(exchangeSegmentCode);
}
