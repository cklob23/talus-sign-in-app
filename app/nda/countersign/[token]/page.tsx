import { CountersignClient } from "./countersign-client"

export const metadata = {
    title: "Countersign NDA",
    robots: { index: false, follow: false },
}

export default async function CountersignPage({ params }: { params: Promise<{ token: string }> }) {
    const { token } = await params
    return <CountersignClient token={token} />
}
