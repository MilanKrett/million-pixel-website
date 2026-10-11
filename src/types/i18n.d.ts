import type adminEn from "@/messages/admin/en.json";
import type en from "@/messages/en.json";

declare module "use-intl" {
  interface AppConfig {
    Messages: typeof en & typeof adminEn;
  }
}
