import { underConstructionMetadata } from "@/components/site/page-metadata";
import { UnderConstruction } from "@/components/site/UnderConstruction";

export const generateMetadata = () => underConstructionMetadata("contact");

export default function Page() {
  return <UnderConstruction page="contact" phase={4} />;
}
