// ENV=local|prod (see .env.example). Anything other than "local" counts as
// prod, so a missing or mistyped value fails closed.
export const isLocalEnv = process.env.ENV === "local"
