import { useEffect } from 'react'
import { getStoredTheme, applyTheme } from './theme'
import ConceptsGallery from './ConceptsGallery'

export default function PublicPortfolio() {
  useEffect(() => {
    applyTheme(getStoredTheme())
  }, [])

  return (
    <div className="hub-page fade-in">
      <div className="toolbar">
        <h1>🧩 Satoru — ผลงาน/แนวทางออกแบบ</h1>
      </div>

      <p className="portfolio-intro">
        รวมตัวอย่างระบบและดีไซน์ที่เคยทำ — สนใจแบบไหนหรืออยากได้ปรับให้ตรงกับธุรกิจของคุณ ทักมาคุยกันได้เลยครับ
      </p>

      <ConceptsGallery />
    </div>
  )
}
