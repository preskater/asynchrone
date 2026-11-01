/**
 * next-intl resolves its request config from the app directory. The actual
 * configuration (locales, messages and time zone) lives in @workspace/i18n so
 * every app shares one copy.
 */
export { default } from "@workspace/i18n/request"
