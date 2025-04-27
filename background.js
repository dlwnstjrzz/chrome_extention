// 전역 변수로 저장
let naverKeywords = [];
let coupangKeywords = [];

// 스마트스토어 API 자동 호출
(async function fetchSmartStoreApi() {
  try {
    // 네이버 쇼핑 페이지에 먼저 접속하여 쿠키 획득
    const shoppingUrl =
      "https://search.shopping.naver.com/search/all?query=%EB%B9%A8%EB%9E%98%EB%B0%94%EA%B5%AC%EB%8B%88";

    console.log("네이버 쇼핑 페이지 접속 시도...");

    // 탭 생성 - 백그라운드에서 작동하도록 active: false로 설정
    const tab = await chrome.tabs.create({ url: shoppingUrl, active: false });

    // 페이지 로딩 대기 - SPA이므로 더 오래 기다림
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // MutationObserver를 사용한 스크롤 함수 정의
    async function scrollToLoadAllContent() {
      const productListSelector = ".basicList_list_basis__XVx_G"; // 상품 리스트 컨테이너
      const productItemSelector = ".product_mall_title__sJPEp"; // 상품 몰 타이틀 선택자
      const paginationSelector = ".pagination_num__qsa2U"; // 페이지네이션 선택자
      const scrollDelay = 300; // 스크롤 후 대기 시간 (ms)
      const maxIdleTime = 3000; // 새로운 콘텐츠 로딩 없이 대기할 최대 시간 (ms)

      return new Promise(async (resolve) => {
        // 스크롤 시작 전 페이지 준비
        // DOM 요소 조작을 위한 준비 - 보이는 영역 확장
        document.body.style.overflow = "auto"; // 스크롤 가능하게 설정
        document.body.style.height = "auto"; // 높이 자동 설정
        document.body.style.minHeight = "30000px"; // 충분히 긴 페이지로 설정하여 스크롤 가능하게

        // 페이지 상단으로
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
        await new Promise((r) => setTimeout(r, 300));

        const container = document.querySelector(productListSelector);
        if (!container) {
          console.error(
            "Product list container not found:",
            productListSelector
          );
          resolve({
            success: false,
            message: "Container not found",
            cookie: document.cookie,
          });
          return;
        }

        let lastScrollTime = Date.now();
        let lastItemCount = 0;
        let currentItemCount = 0;
        let idleScrolls = 0; // 변화 없이 스크롤한 횟수 카운터
        const maxIdleScrolls = 5; // 최대 허용 유휴 스크롤 횟수
        let scrollPosition = 0; // 현재 스크롤 위치
        const scrollIncrement = 800; // 한 번에 스크롤할 픽셀 수

        // 모든 상품 몰 타이틀 요소와 페이지네이션 요소 데이터 수집 함수
        const collectData = () => {
          const productItems = document.querySelectorAll(productItemSelector);
          const pagination = document.querySelector(paginationSelector);

          // 상품 몰 타이틀 정보 수집
          const mallTitlesData = Array.from(productItems).map((el) => {
            // 첫 번째 a 태그 찾기
            const aTag = el.querySelector("a");
            const href = aTag ? aTag.getAttribute("href") : null;

            return {
              text: el.textContent.trim(),
              html: el.outerHTML,
              href: href, // a 태그의 href 속성 추가
              hasLink: !!href, // 링크 존재 여부 추가
            };
          });

          // 페이지네이션 정보 수집
          const paginationInfo = pagination
            ? {
                exists: true,
                text: pagination.textContent,
                html: pagination.outerHTML,
              }
            : { exists: false };

          return {
            mallTitlesData,
            paginationInfo,
            productListExists: !!container,
            mallTitlesCount: productItems.length,
          };
        };

        // 포커스 없이도 작동하는 스크롤 함수
        const forceScroll = (position) => {
          // 스크롤 위치 설정 (여러 방법 동시 사용)
          document.documentElement.scrollTop = position;
          document.body.scrollTop = position;
          window.scrollTo(0, position);

          // 스크롤 이벤트 트리거
          const scrollEvent = new Event("scroll", { bubbles: true });
          document.dispatchEvent(scrollEvent);
          window.dispatchEvent(scrollEvent);

          // 스크롤 위치까지 화면에 보이는 영역 강제 확장
          // 이렇게 하면 화면에 보이지 않더라도 해당 위치의 요소가 로드됨
          const scrollBottom = position + window.innerHeight;
          if (document.body.style.minHeight !== `${scrollBottom + 1000}px`) {
            document.body.style.minHeight = `${scrollBottom + 1000}px`;
          }

          return position;
        };

        // DOM 변경 감지를 위한 MutationObserver 설정
        const observer = new MutationObserver((mutationsList, observer) => {
          // DOM 변경 감지 시 마지막 스크롤 시간 업데이트
          lastScrollTime = Date.now();
          idleScrolls = 0; // DOM 변경 감지 시 유휴 스크롤 카운터 초기화
          console.log("DOM mutation detected, new content likely loaded.");
        });

        // 컨테이너의 자식 요소 및 하위 트리 변경 감시
        observer.observe(container, { childList: true, subtree: true });

        // IntersectionObserver 오버라이드하여 무한 스크롤 트리거
        const originalIntersectionObserver = window.IntersectionObserver;
        window.IntersectionObserverEntries = [];

        // SPA의 IntersectionObserver 콜백 수집
        window.IntersectionObserver = function (callback, options) {
          const wrappedCallback = (entries, observer) => {
            // 콜백 실행 전 로그
            console.log("IntersectionObserver callback triggered");
            // 원래 콜백 실행
            return callback(entries, observer);
          };

          // IntersectionObserver 트래킹 (나중에 강제 트리거용)
          const instance = new originalIntersectionObserver(
            wrappedCallback,
            options
          );
          window.IntersectionObserverEntries.push({
            instance,
            callback: wrappedCallback,
            options,
          });

          return instance;
        };

        const scrollLoop = async () => {
          // 현재 아이템 수 확인
          currentItemCount =
            document.querySelectorAll(productItemSelector).length;
          console.log(
            `현재 아이템 개수: ${currentItemCount}, 이전 아이템 개수: ${lastItemCount}, 스크롤 위치: ${scrollPosition}px`
          );

          // 페이지네이션 요소 확인
          const paginationExists = !!document.querySelector(paginationSelector);
          if (paginationExists) {
            console.log("페이지네이션 요소를 찾았습니다. 스크롤 완료.");
            observer.disconnect();

            // 페이지네이션까지 스크롤하여 모든 요소가 로드되도록 함
            const pagination = document.querySelector(paginationSelector);
            if (pagination) {
              // 페이지네이션 요소로 스크롤 (위치 계산)
              const pagRect = pagination.getBoundingClientRect();
              const targetScrollPosition = scrollPosition + pagRect.top - 100;
              forceScroll(targetScrollPosition);
              await new Promise((r) => setTimeout(r, 500)); // 스크롤 완료 대기
            }

            const data = collectData();

            // IntersectionObserver 원래대로 복원
            window.IntersectionObserver = originalIntersectionObserver;

            resolve({
              success: true,
              itemCount: currentItemCount,
              message: "Found pagination, scroll complete.",
              cookie: document.cookie,
              ...data,
            });
            return;
          }

          // 스크롤 후 아이템 개수 증가 또는 첫 시도인 경우
          if (currentItemCount > lastItemCount || lastItemCount === 0) {
            lastItemCount = currentItemCount;
            lastScrollTime = Date.now(); // 아이템 증가 시 시간 초기화
            idleScrolls = 0; // 아이템 증가 시 유휴 카운터 초기화

            console.log(
              `아래로 스크롤 중... 위치: ${scrollPosition} -> ${
                scrollPosition + scrollIncrement
              }`
            );

            // 스크롤 증가
            scrollPosition += scrollIncrement;
            forceScroll(scrollPosition);

            // IntersectionObserver 강제 트리거 시도
            if (
              window.IntersectionObserverEntries &&
              window.IntersectionObserverEntries.length > 0
            ) {
              try {
                // 각 등록된 Observer의 콜백 강제 호출
                window.IntersectionObserverEntries.forEach((entry) => {
                  // 가상의 진입 항목 생성
                  const mockEntry = {
                    isIntersecting: true,
                    intersectionRatio: 1,
                    boundingClientRect: { bottom: window.innerHeight, top: 0 },
                    target:
                      document.querySelector(productListSelector) ||
                      document.body,
                  };

                  // 콜백 호출
                  entry.callback([mockEntry], entry.instance);
                });
                console.log(
                  "IntersectionObserver callbacks triggered manually"
                );
              } catch (e) {
                console.error("Error triggering IntersectionObserver:", e);
              }
            }

            // 스크롤 후 잠시 대기 (네트워크 요청 시간 고려)
            await new Promise((r) => setTimeout(r, scrollDelay));

            // 다음 루프 실행
            setTimeout(scrollLoop, 100);
          }
          // 아이템 개수 변화가 없고, 최대 유휴 시간을 초과한 경우
          else if (
            Date.now() - lastScrollTime > maxIdleTime ||
            idleScrolls >= maxIdleScrolls
          ) {
            if (idleScrolls >= maxIdleScrolls) {
              console.log(
                `${maxIdleScrolls}번의 연속 스크롤 후에도 새 아이템이 로드되지 않았습니다. 목록의 끝으로 가정합니다.`
              );
            } else {
              console.log(
                `${maxIdleTime}ms 동안 새 아이템이 로드되지 않았습니다. 목록의 끝으로 가정합니다.`
              );
            }
            observer.disconnect();

            // IntersectionObserver 원래대로 복원
            window.IntersectionObserver = originalIntersectionObserver;

            const data = collectData();
            resolve({
              success: true,
              itemCount: currentItemCount,
              message: "Reached end of scroll.",
              cookie: document.cookie,
              ...data,
            });
          }
          // 아이템 개수 변화가 없지만, 아직 대기 시간이 남은 경우
          else {
            idleScrolls++;
            console.log(
              `새 아이템이 없습니다. 곧 다시 확인합니다... (유휴 스크롤 횟수: ${idleScrolls})`
            );

            // 스크롤 증가
            scrollPosition += scrollIncrement;
            forceScroll(scrollPosition);

            await new Promise((r) => setTimeout(r, scrollDelay));
            setTimeout(scrollLoop, 100);
          }
        };

        // 스크롤 루프 시작
        scrollLoop();
      });
    }

    // 페이지 스크롤 실행
    console.log("페이지 스크롤 시작 (MutationObserver 방식)...");
    const scrollResult = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: scrollToLoadAllContent,
    });

    console.log("페이지 스크롤 결과:", scrollResult[0]?.result);

    if (!scrollResult[0]?.result?.success) {
      console.warn(
        "스크롤 중 문제가 발생했을 수 있습니다:",
        scrollResult[0]?.result?.message
      );
    } else {
      console.log(
        "페이지 스크롤 완료. 총 아이템:",
        scrollResult[0].result.itemCount
      );
    }

    // 스크롤 결과에서 데이터 추출
    const pageData = scrollResult[0]?.result || {};

    // 필요한 경우 추가 데이터 수집
    if (!pageData.mallTitlesData || pageData.mallTitlesCount === 0) {
      console.log("추가 데이터 수집 시도...");

      const additionalData = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          // 상품 목록이 로드되었는지 확인 - basicList_list_basis__XVx_G 클래스로 확인
          const productList = document.querySelector(
            ".basicList_list_basis__XVx_G"
          );

          // product_mall_title__sJPEp 클래스를 가진 모든 div 태그 찾기
          const mallTitles = document.querySelectorAll(
            ".product_mall_title__sJPEp"
          );
          const mallTitlesData = Array.from(mallTitles).map((el) => {
            // 첫 번째 a 태그 찾기
            const aTag = el.querySelector("a");
            const href = aTag ? aTag.getAttribute("href") : null;

            return {
              text: el.textContent.trim(),
              html: el.outerHTML,
              href: href, // a 태그의 href 속성 추가
              hasLink: !!href, // 링크 존재 여부 추가
            };
          });

          // 페이지네이션 요소 정보 가져오기
          const paginationElement = document.querySelector(
            ".pagination_num__qsa2U"
          );
          const paginationInfo = paginationElement
            ? {
                exists: true,
                text: paginationElement.textContent,
                position: paginationElement.getBoundingClientRect(),
                html: paginationElement.outerHTML,
              }
            : { exists: false };

          // 현재 페이지 DOM 상태 정보
          const domInfo = {
            currentScroll: window.scrollY,
            documentHeight: document.documentElement.scrollHeight,
            windowHeight: window.innerHeight,
            bodyHeight: document.body.scrollHeight,
          };

          return {
            cookie: document.cookie,
            title: document.title,
            isLoaded: productList !== null,
            productListExists: productList !== null,
            mallTitlesData: mallTitlesData,
            mallTitlesCount: mallTitles.length,
            scrollHeight: document.documentElement.scrollHeight,
            paginationInfo: paginationInfo,
            domInfo: domInfo,
          };
        },
      });

      // 데이터 병합
      Object.assign(pageData, additionalData[0]?.result || {});
    }

    console.log("상품 목록 로드 여부:", pageData.productListExists);
    console.log("페이지네이션 요소 정보:", pageData.paginationInfo);
    console.log("몰 타이틀 요소 개수:", pageData.mallTitlesCount);
    console.log("몰 타이틀 요소들:", pageData.mallTitlesData);

    // 탭 닫기
    // await chrome.tabs.remove(tab.id);

    // 실제 API 요청
    const apiUrl =
      "https://smartstore.naver.com/i/v2/channels/2sWDyg5V9pbfW9tndQeqM/products/5058503892?withWindow=false";

    const response = await fetch(apiUrl, {
      method: "GET",
      headers: {
        accept: "application/json, text/plain, */*",
        "accept-language": "ko,en-US;q=0.9,en;q=0.8,ko-KR;q=0.7",
        referer: "https://smartstore.naver.com/daizzirong5058503892",
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
        cookie: pageData.cookie || "",
      },
    });

    if (!response.ok) {
      throw new Error(`API 요청 실패: ${response.status}`);
    }

    const data = await response.json();
    console.log("스마트스토어 API 응답:", data);
  } catch (error) {
    console.error("스마트스토어 API 호출 중 오류 발생:", error);
  }
})();

chrome.runtime.onMessage.addListener(async (message, sender) => {
  if (message.action === "SCRAPE_NAVER") {
    // 1. 네이버 쇼핑 API 호출
    const query = encodeURIComponent(message.query);
    const apiUrl = `https://whale-ecommerce-website.vercel.app/api/naver-shopping-search-api?query=${query}`;
    const res = await fetch(apiUrl);
    const result = await res.json();
    console.log("result", result);
    // 2. 메인 상품 페이지만 필터링 (최대 5개)
    const validItems = result.items
      .filter((item) => item.link.includes("main/products"))
      .slice(0, 8);

    // 3. 스크래핑 함수
    const scrapeItem = async (item) => {
      try {
        const tab = await chrome.tabs.create({ url: item.link, active: false });

        // 첫 번째 시도
        let results = await chrome.scripting.executeScript({
          target: { tabId: tab.id, allFrames: true },
          func: () => {
            return {
              html: document.documentElement.outerHTML,
              title: document.title,
              hasError: document.title.includes("[에러]"),
            };
          },
        });

        // 에러 페이지인 경우 새로고침 시도
        if (results[0].result.hasError) {
          console.log("에러 페이지 감지, 새로고침 시도...");

          // 새로고침 버튼 클릭
          await chrome.scripting.executeScript({
            target: { tabId: tab.id, allFrames: true },
            func: () => {
              const refreshButton =
                document.querySelector("a.button.highlight");
              if (refreshButton) {
                refreshButton.click();
                return true;
              }
              return false;
            },
          });

          // 새로고침 후 2초 대기
          await new Promise((resolve) => setTimeout(resolve, 200));

          // 새로고침된 페이지에서 다시 HTML 가져오기
          results = await chrome.scripting.executeScript({
            target: { tabId: tab.id, allFrames: true },
            func: () => {
              return {
                html: document.documentElement.outerHTML,
                title: document.title,
                hasError: document.title.includes("[에러]"),
              };
            },
          });
        }

        // 메타 태그에서 키워드 추출
        const keywords = await chrome.scripting.executeScript({
          target: { tabId: tab.id, allFrames: true },
          func: () => {
            return (
              document
                .querySelector('meta[name="keywords"]')
                ?.getAttribute("content") || null
            );
          },
        });

        // 탭 닫기
        setTimeout(() => {
          chrome.tabs.remove(tab.id);
        }, 2000);

        if (keywords[0].result) {
          return {
            productTitle: item.title,
            link: item.link,
            keywords: keywords[0].result,
          };
        }
        return null;
      } catch (err) {
        console.error(`Error scraping ${item.link}:`, err);
        return null;
      }
    };

    // 4. 순차적으로 스크래핑 실행
    const scrapedResults = [];

    for (let i = 0; i < validItems.length; i++) {
      const item = validItems[i];

      const result = await scrapeItem(item);
      if (result) {
        scrapedResults.push(result);
      }
      // 마지막 상품이 아니면 500ms 대기
      if (i < validItems.length - 1) {
        await new Promise((resolve) =>
          setTimeout(resolve, Math.floor(Math.random() * 501) + 300)
        );
      }
    }

    // 5. 키워드 빈도 분석
    const keywordFrequency = {};
    const keywordSources = {};

    scrapedResults.forEach((result) => {
      if (!result.keywords) return;

      // 앞에서부터 10개 키워드만 사용
      const keywords = result.keywords
        .split(",")
        .map((k) => k.trim())
        .filter((k) => k.length > 0) // 빈 문자열 필터링
        .slice(0, 10); // 앞에서부터 10개만 사용

      const keywordCount = keywords.length;

      keywords.forEach((keyword) => {
        if (!keywordFrequency[keyword]) {
          keywordFrequency[keyword] = 0;
          keywordSources[keyword] = [];
        }
        keywordFrequency[keyword]++;
        keywordSources[keyword].push({
          count: keywordCount,
          productTitle: result.productTitle,
        });
      });
    });
    // 6. 키워드 정렬 (빈도수 + 우선순위)
    const sortedKeywords = Object.entries(keywordFrequency)
      .map(([keyword, frequency]) => ({
        keyword,
        frequency,
        sources: keywordSources[keyword],
      }))
      .sort((a, b) => {
        // 빈도수가 다르면 빈도수로 정렬
        if (a.frequency !== b.frequency) {
          return b.frequency - a.frequency;
        }

        // 빈도수가 같으면 (특히 1인 경우) 키워드가 많은 메타태그 우선
        const aMaxSourceCount = Math.max(...a.sources.map((s) => s.count));
        const bMaxSourceCount = Math.max(...b.sources.map((s) => s.count));

        if (a.frequency === 1 && b.frequency === 1) {
          // 빈도수가 1인 경우, 15개 이상 키워드를 가진 메타태그 우선
          const aHasManyKeywords = aMaxSourceCount >= 15;
          const bHasManyKeywords = bMaxSourceCount >= 15;
          if (aHasManyKeywords !== bHasManyKeywords) {
            return bHasManyKeywords - aHasManyKeywords;
          }
        }

        return bMaxSourceCount - aMaxSourceCount;
      })
      .map((item) => item.keyword);
    // 7. 결과를 content script로 전달
    naverKeywords = sortedKeywords.slice(0, 10);
    chrome.tabs.sendMessage(sender.tab.id, {
      type: "SCRAPING_RESULTS",
      naverKeywords,
      coupangKeywords,
      rawNaverKeywords: sortedKeywords,
    });
  } else if (message.action === "SCRAPE_COUPANG") {
    const query = encodeURIComponent(message.query);
    const url = `https://www.coupang.com/np/search?q=${query}&channel=recent`;

    try {
      const tab = await chrome.tabs.create({ url, active: false });
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        func: () => {
          const keywordElements = document.querySelectorAll("[data-keyword]");
          return Array.from(keywordElements).map((el) =>
            el.getAttribute("data-keyword")
          );
        },
      });
      await chrome.tabs.remove(tab.id);

      if (results?.[0]?.result) {
        coupangKeywords = results[0].result.slice(0, 10);

        // 네이버 결과가 이미 있다면 content script로 전달
        if (naverKeywords.length > 0) {
          chrome.tabs.sendMessage(sender.tab.id, {
            type: "SCRAPING_RESULTS",
            naverKeywords,
            coupangKeywords,
          });
        }
      }
    } catch (err) {
      console.error("쿠팡 스크래핑 에러:", err);
    }
  }
});
