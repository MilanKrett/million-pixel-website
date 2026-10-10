import { underConstructionMetadata } from "@/components/site/page-metadata";
import { UnderConstruction } from "@/components/site/UnderConstruction";

export const generateMetadata = () => underConstructionMetadata("report");

export default function Page() {
  return <UnderConstruction page="report" phase={3} />;
}
