export const config = {
  port: Number(process.env.PORT ?? 3001),
  derivPublicWs:
    process.env.DERIV_PUBLIC_WS ?? 'wss://api.derivws.com/trading/v1/options/ws/public',
};
