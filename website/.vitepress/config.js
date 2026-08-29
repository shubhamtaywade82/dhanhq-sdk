import { defineConfig } from "vitepress";

// https://vitepress.dev/reference/site-config
export default defineConfig({
  lang: "en-US",
  base: "/dhanhq-sdk/",
  title: "DhanHQ TypeScript SDK",
  description:
    "Production-grade TypeScript and Node.js SDK for DhanHQ API v2 with REST APIs, WebSocket market data, option analytics, technical analysis, risk management, trading skills and MCP server tools.",

  head: [
    ["link", { rel: "icon", href: "/favicon.ico" }],
    [
      "meta",
      { name: "keywords", content: "dhanhq, typescript, nodejs, trading-api, algorithmic-trading, nse, bse, websocket, mcp-server, dhan-api" },
    ],
    ["meta", { property: "og:title", content: "DhanHQ TypeScript SDK | Node.js Trading API Client" }],
    [
      "meta",
      {
        property: "og:description",
        content:
          "Open-source TypeScript and Node.js SDK for DhanHQ APIs with REST trading APIs, WebSocket market data, option analytics, technical indicators and MCP tools.",
      },
    ],
    ["meta", { property: "og:url", content: "https://shubhamtaywade82.github.io/dhanhq-sdk/" }],
    ["meta", { property: "og:type", content: "website" }],
    ["meta", { name: "twitter:card", content: "summary_large_image" }],
    [
      "meta",
      {
        name: "twitter:title",
        content: "DhanHQ TypeScript SDK | Node.js Trading API Client",
      },
    ],
    [
      "meta",
      {
        name: "twitter:description",
        content:
          "Production-grade TypeScript SDK for DhanHQ API v2 — WebSocket, option analytics, technical analysis, MCP server.",
      },
    ],
    ["link", { rel: "canonical", href: "https://shubhamtaywade82.github.io/dhanhq-sdk/" }],
  ],

  themeConfig: {
    logo: { light: "/logo-light.svg", dark: "/logo-dark.svg" },

    nav: [
      { text: "Home", link: "/" },
      { text: "Getting Started", link: "/getting-started" },
      { text: "API", link: "/api/orders" },
      { text: "WebSocket", link: "/websocket/market-feed" },
      { text: "Analytics", link: "/analytics/technical-analysis" },
      { text: "MCP Server", link: "/ai/mcp-server" },
      { text: "Full Reference", link: "/reference/" },
      { text: "GitHub", link: "https://github.com/shubhamtaywade82/dhanhq-sdk" },
    ],

    sidebar: [
      {
        text: "Getting Started",
        items: [
          { text: "Installation", link: "/getting-started" },
          { text: "Quick Start", link: "/getting-started#quick-start" },
          { text: "Authentication", link: "/getting-started#authentication" },
        ],
      },
      {
        text: "API Reference",
        items: [
          { text: "Orders", link: "/api/orders" },
          { text: "Option Chain", link: "/api/option-chain" },
          { text: "Market Feed", link: "/api/market-feed" },
          { text: "Expired Options Data", link: "/api/expired-options" },
          { text: "Portfolio & Funds", link: "/api/portfolio" },
          { text: "Forever Orders (GTT)", link: "/api/forever-orders" },
          { text: "Conditional Triggers", link: "/api/conditional-triggers" },
          { text: "eDIS", link: "/api/edis" },
          { text: "Trader's Control", link: "/api/trader-controls" },
          { text: "Global Stocks", link: "/api/global-stocks" },
        ],
      },
      {
        text: "WebSocket",
        items: [
          { text: "Market Feed", link: "/websocket/market-feed" },
          { text: "Order Updates", link: "/websocket/order-updates" },
        ],
      },
      {
        text: "Analytics",
        items: [
          { text: "Technical Analysis", link: "/analytics/technical-analysis" },
          { text: "Option Greeks & IV", link: "/analytics/option-greeks" },
        ],
      },
      {
        text: "Risk Management",
        link: "/risk/",
        items: [
          { text: "Pre-Trade Pipeline", link: "/risk/#pre-trade-pipeline" },
          { text: "Position Monitor", link: "/risk/#position-monitor" },
        ],
      },
      {
        text: "AI & MCP",
        link: "/ai/mcp-server",
        items: [
          { text: "MCP Server", link: "/ai/mcp-server" },
          { text: "Agent Tools", link: "/ai/mcp-server#agent-tools" },
        ],
      },
      {
        text: "Reference",
        items: [
          {
            text: "Full API Reference (generated)",
            link: "/reference/",
          },
          { text: "Architecture", link: "https://github.com/shubhamtaywade82/dhanhq-sdk/blob/main/docs/ARCHITECTURE.md" },
          { text: "Trading Rules", link: "https://github.com/shubhamtaywade82/dhanhq-sdk/blob/main/docs/TRADING_RULES.md" },
          { text: "WS Protocol", link: "https://github.com/shubhamtaywade82/dhanhq-sdk/blob/main/docs/WS_PROTOCOL.md" },
          { text: "Agent Tools", link: "https://github.com/shubhamtaywade82/dhanhq-sdk/blob/main/docs/AGENT_TOOLS.md" },
          { text: "Authentication (Detailed)", link: "https://github.com/shubhamtaywade82/dhanhq-sdk/blob/main/docs/AUTHENTICATION.md" },
          { text: "Browser Usage", link: "https://github.com/shubhamtaywade82/dhanhq-sdk/blob/main/docs/BROWSER.md" },
        ],
      },
    ],

    socialLinks: [
      { icon: "github", link: "https://github.com/shubhamtaywade82/dhanhq-sdk" },
      { icon: "npm", link: "https://www.npmjs.com/package/@nemesis-oss/dhanhq-sdk" },
    ],

    footer: {
      message: "Community project — not affiliated with Dhan. MIT License.",
      copyright: `Copyright ${new Date().getFullYear()} Shubham Taywade`,
    },

    editLink: {
      pattern: "https://github.com/shubhamtaywade82/dhanhq-sdk/edit/main/website/:path",
      text: "Edit this page on GitHub",
    },

    search: { provider: "local" },
  },



  lastUpdated: true,
  cleanUrls: true,
});
