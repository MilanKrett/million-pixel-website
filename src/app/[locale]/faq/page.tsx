import { underConstructionMetadata } from "@/components/site/page-metadata";
import { UnderConstruction } from "@/components/site/UnderConstruction";

export const generateMetadata = () => underConstructionMetadata("faq");

export default function Page() {
  return <UnderConstruction page="faq" phase={4} />;
}
