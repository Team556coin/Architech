import { Suspense } from "react";
import { HomeScreen } from "@/components/home/HomeScreen";

export default function Home() {
  return (
    <Suspense>
      <HomeScreen />
    </Suspense>
  );
}
