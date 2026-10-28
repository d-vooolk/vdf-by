import Script from "next/script";

import { GA_MEASUREMENT_ID, METRIKA_ID, NO_ANALYTICS_COOKIE } from "@/lib/analytics";

export function Analytics() {
  if (process.env.NODE_ENV !== "production") return null;

  return (
    <>
      <Script id="analytics" strategy="lazyOnload">
        {`if (document.cookie.split('; ').indexOf('${NO_ANALYTICS_COOKIE}=1') < 0) {
        window.dataLayer = window.dataLayer || [];
        (function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
        m[i].l=1*new Date();
        for (var j = 0; j < document.scripts.length; j++) {if (document.scripts[j].src === r) { return; }}
        k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})
        (window, document,'script','https://mc.yandex.ru/metrika/tag.js?id=${METRIKA_ID}', 'ym');
        ym(${METRIKA_ID}, 'init', {ssr:true, clickmap:true, ecommerce:"dataLayer", accurateTrackBounce:true, trackLinks:true});

        var gtagScript = document.createElement('script');
        gtagScript.async = true;
        gtagScript.src = 'https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}';
        document.head.appendChild(gtagScript);
        window.gtag = function(){dataLayer.push(arguments);};
        gtag('js', new Date());
        gtag('config', '${GA_MEASUREMENT_ID}');
        }`}
      </Script>

      <noscript>
        <div>
          <img
            src={`https://mc.yandex.ru/watch/${METRIKA_ID}`}
            style={{ position: "absolute", left: "-9999px" }}
            alt=""
          />
        </div>
      </noscript>
    </>
  );
}
