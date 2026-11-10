import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
 title:'Palate Lab — 나만의 취향 지도',
 description:'음식 취향 순위·쌍대비교·추천 실험을 위한 독립 프로토타입'
};
export default function RootLayout({children}:{children:React.ReactNode}){
 return <html lang="ko"><body>{children}</body></html>;
}
