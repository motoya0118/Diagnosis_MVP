/** @type {import('next').NextConfig} */
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

const nextConfig = {
  reactStrictMode: true,
  env: {
    // トーストを自動で閉じるまでの時間（ミリ秒）
    NEXT_PUBLIC_FEEDBACK_AUTO_DISMISS_MS: "5000",
    // デバイスIDを保持するクッキーの有効期限（秒）
    NEXT_PUBLIC_DEVICE_ID_COOKIE_MAX_AGE: String(ONE_YEAR_SECONDS),
  },
};

module.exports = nextConfig;
