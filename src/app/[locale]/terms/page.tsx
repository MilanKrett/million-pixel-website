import { underConstructionMetadata } from "@/components/site/page-metadata";
import { UnderConstruction } from "@/components/site/UnderConstruction";

export const generateMetadata = () => underConstructionMetadata("terms");

export default function Page() {
  return <UnderConstruction page="terms" phase={4} />;
}
