// CSP 우회: 외부 스크립트 파일을 로드하는 방식 사용
// 1. 스크립트 URL 가져오기
const scriptURL = chrome.runtime.getURL("injected.js");

// 2. 스크립트 엘리먼트 생성 및 속성 설정
const scriptElement = document.createElement("script");
scriptElement.src = scriptURL;
scriptElement.type = "text/javascript";

// 3. DOM에 스크립트 엘리먼트 추가
(document.head || document.documentElement).appendChild(scriptElement);

// 4. 로드 완료 후 제거 (선택적)
scriptElement.onload = function () {
  scriptElement.remove();
};

(function setupObserver() {
  // 이미 버튼 핸들러가 설정되었는지 추적
  let buttonHandlerSetup = false;
  let observer = null;

  // 버튼과 입력창을 찾아 이벤트 핸들러 연결하는 함수
  function setupButtonHandler() {
    const inputEl = document.getElementById("tagProductName");
    const existingBtn = document.getElementById("tagProductNameButton");
    const targetContainer = document.getElementById("tagResultParent");

    if (inputEl && existingBtn && targetContainer) {
      // 이전에 이미 설정했더라도 페이지 전환 후에는 다시 설정
      buttonHandlerSetup = true;

      // 결과 컨테이너는 버튼 클릭 시에만 생성
      existingBtn.onclick = () => {
        const query = inputEl.value.trim();
        if (query) {
          // 결과 컨테이너가 없으면 생성
          let resultContainer = document.getElementById("scraping-results");
          if (!resultContainer) {
            resultContainer = document.createElement("div");
            resultContainer.id = "scraping-results";
            resultContainer.style.cssText = "margin-top: 20px;";
            targetContainer.appendChild(resultContainer);
          }

          // 초기 로딩 상태 표시
          displayResults(null, null, null);

          // 네이버와 쿠팡 스크래핑 시작
          chrome.runtime.sendMessage({ action: "SCRAPE_NAVER", query });
          chrome.runtime.sendMessage({ action: "SCRAPE_COUPANG", query });
        } else {
          alert("검색어를 입력하세요");
        }
      };

      return true;
    }

    return false;
  }

  // URL 변경 감지 함수
  let lastUrl = location.href;
  function checkForUrlChange() {
    const currentUrl = location.href;
    if (currentUrl !== lastUrl) {
      lastUrl = currentUrl;
      buttonHandlerSetup = false; // URL이 변경되면 핸들러 재설정
      startObserving(); // 새 페이지에서 다시 관찰 시작
    }
  }

  // 주기적으로 URL 변경 확인
  setInterval(checkForUrlChange, 1000);

  // 관찰 시작 함수
  function startObserving() {
    // 페이지 로드 시 즉시 확인
    if (setupButtonHandler()) {
      if (observer) {
        observer.disconnect();
      }
      return;
    }

    // 이미 관찰 중이면 중단
    if (observer) {
      observer.disconnect();
    }

    // DOM 변경 감지를 위한 MutationObserver 설정
    observer = new MutationObserver((mutations) => {
      // 이미 핸들러가 설정되었으면 더 이상 확인하지 않음
      if (buttonHandlerSetup) {
        return;
      }

      // DOM이 변경되면 버튼과 입력창이 있는지 확인
      if (setupButtonHandler()) {
        observer.disconnect();
      }
    });

    // body 전체의 하위 트리 변경 감지
    if (document.body) {
      observer.observe(document.body, {
        childList: true,
        subtree: true,
      });
    } else {
      // body가 아직 없으면 로드될 때까지 대기
      document.addEventListener("DOMContentLoaded", () => {
        observer.observe(document.body, {
          childList: true,
          subtree: true,
        });
      });
    }
  }

  // 관찰 시작
  startObserving();
})();

// textarea 높이 자동 조절 함수 추가
function autoResizeTextarea(textarea) {
  // 임시로 높이를 auto로 설정하여 내용에 맞게 크기 조절
  textarea.style.height = "auto";
  // 스크롤 높이에 맞게 높이 설정 (최소 60px)
  textarea.style.height = `${Math.max(60, textarea.scrollHeight)}px`;
}

function createResultsContainer() {
  const container = document.createElement("div");
  container.id = "scraping-results";
  container.style.cssText = `
    width: 100%;
    background: #ffffff;
    border-radius: 12px;
    padding: 24px;
    margin-top: 24px;
    display: flex;
    flex-direction: column;
    gap: 24px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  `;

  // 통합 키워드 섹션
  const combinedSection = document.createElement("div");
  combinedSection.style.cssText = `
    background: #1a1a1a;
    padding: 24px;
    border-radius: 8px;
  `;

  const combinedHeader = document.createElement("div");
  combinedHeader.style.cssText = `
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
  `;

  const combinedTitle = document.createElement("h2");
  combinedTitle.textContent = "완성 태그";
  combinedTitle.style.cssText = `
    color: #FCB700;
    font-size: 18px;
    font-weight: bold;
    margin: 0;
  `;

  const copyButton = document.createElement("button");
  copyButton.textContent = "복사하기";
  copyButton.style.cssText = `
    background: transparent;
    border: none;
    color: white;
    cursor: pointer;
    padding: 8px 16px;
    border-radius: 6px;
    transition: background 0.2s;
  `;
  copyButton.onmouseover = () =>
    (copyButton.style.background = "rgba(255,255,255,0.1)");
  copyButton.onmouseout = () => (copyButton.style.background = "transparent");

  combinedHeader.appendChild(combinedTitle);
  combinedHeader.appendChild(copyButton);

  const combinedInput = document.createElement("textarea");
  combinedInput.style.cssText = `
    width: 100%;
    background: transparent;
    border: none;
    border-bottom: 1px solid rgba(255,255,255,0.2);
    color: #fff;
    font-size: 18px;
    font-weight: 600;
    padding: 8px 0;
    outline: none;
    transition: border-color 0.2s, height 0.2s;
    resize: none;
    min-height: 60px;
    line-height: 1.5;
    overflow-y: hidden;
    word-wrap: break-word;
    box-sizing: border-box;
  `;
  combinedInput.onfocus = () =>
    (combinedInput.style.borderColor = "rgba(255,255,255,0.4)");
  combinedInput.onblur = () =>
    (combinedInput.style.borderColor = "rgba(255,255,255,0.2)");

  // 입력 시 높이 자동 조절
  combinedInput.oninput = () => {
    autoResizeTextarea(combinedInput);
    updateKeywordCount(combinedInput);
  };

  // 키워드 갯수 표시
  const keywordCount = document.createElement("div");
  keywordCount.style.cssText = `
    color: white;
    font-size: 16px;
    font-weight: 600;
    margin-top: 12px;
    padding: 8px 12px;
    background: rgba(255,255,255,0.1);
    border-radius: 6px;
    display: inline-block;
  `;

  combinedSection.appendChild(combinedHeader);
  combinedSection.appendChild(combinedInput);
  combinedSection.appendChild(keywordCount);

  // 네이버/쿠팡 키워드 섹션
  const keywordsSection = document.createElement("div");
  keywordsSection.style.cssText = `
    display: flex;
    gap: 24px;
  `;

  // 네이버 키워드 섹션
  const naverSection = document.createElement("div");
  naverSection.style.cssText = `
    flex: 1;
    background: #f5f5f5;
    padding: 24px;
    border-radius: 8px;
  `;

  const naverTitle = document.createElement("h2");
  naverTitle.textContent = "네이버 태그";
  naverTitle.style.cssText = `
    color: #2563eb;
    font-size: 18px;
    font-weight: bold;
    margin: 0 0 16px 0;
  `;

  const naverKeywords = document.createElement("div");
  naverKeywords.id = "naver-keywords";
  naverKeywords.style.cssText = `
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
  `;

  naverSection.appendChild(naverTitle);
  naverSection.appendChild(naverKeywords);

  // 쿠팡 키워드 섹션
  const coupangSection = document.createElement("div");
  coupangSection.style.cssText = `
    flex: 1;
    background: #f5f5f5;
    padding: 24px;
    border-radius: 8px;
  `;

  const coupangTitle = document.createElement("h2");
  coupangTitle.textContent = "쿠팡 검색어";
  coupangTitle.style.cssText = `
    color: #2563eb;
    font-size: 18px;
    font-weight: bold;
    margin: 0 0 16px 0;
  `;

  const coupangKeywords = document.createElement("div");
  coupangKeywords.id = "coupang-keywords";
  coupangKeywords.style.cssText = `
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
  `;

  coupangSection.appendChild(coupangTitle);
  coupangSection.appendChild(coupangKeywords);

  keywordsSection.appendChild(naverSection);
  keywordsSection.appendChild(coupangSection);

  container.appendChild(combinedSection);
  container.appendChild(keywordsSection);

  return {
    container,
    combinedInput,
    naverKeywords,
    coupangKeywords,
    copyButton,
  };
}

// 로딩 스피너 컴포넌트 생성 함수
function createLoadingSpinner() {
  const spinner = document.createElement("div");
  spinner.style.cssText = `
    width: 24px;
    height: 24px;
    border: 3px solid #f3f3f3;
    border-top: 3px solid #2563eb;
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin: 20px auto;
  `;

  // 스피너 애니메이션 추가
  const styleSheet = document.createElement("style");
  styleSheet.textContent = `
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(styleSheet);

  return spinner;
}

// 키워드 요소 생성 함수 추가
function createKeywordElement(keyword, combinedInput) {
  const keywordElement = document.createElement("div");
  keywordElement.textContent = keyword;
  keywordElement.style.cssText = `
    color: #1f2937;
    font-size: 14px;
    padding: 8px;
    background: #ffffff;
    border-radius: 8px;
    box-shadow: 0 1px 2px rgba(0,0,0,0.05);
    cursor: pointer;
    transition: background-color 0.2s;
  `;

  // 호버 효과
  keywordElement.onmouseover = () => {
    keywordElement.style.backgroundColor = "#f3f4f6";
  };
  keywordElement.onmouseout = () => {
    keywordElement.style.backgroundColor = "#ffffff";
  };

  // 클릭 이벤트 추가
  keywordElement.onclick = () => {
    // 현재 커서 위치 가져오기
    const cursorPosition = combinedInput.selectionStart;
    const currentText = combinedInput.value;

    // 커서 위치에 키워드 삽입
    if (currentText.length === 0) {
      // 비어있는 경우
      combinedInput.value = keyword;
    } else if (cursorPosition === currentText.length) {
      // 커서가 맨 끝에 있는 경우
      if (currentText.endsWith(",")) {
        combinedInput.value = currentText + keyword;
      } else if (currentText.endsWith(",")) {
        combinedInput.value = currentText + keyword;
      } else {
        combinedInput.value = currentText + "," + keyword;
      }
    } else {
      // 커서가 중간에 있는 경우
      const beforeCursor = currentText.substring(0, cursorPosition);
      const afterCursor = currentText.substring(cursorPosition);

      if (beforeCursor.endsWith(", ") || beforeCursor.endsWith(" ")) {
        combinedInput.value = beforeCursor + keyword + "," + afterCursor;
      } else if (beforeCursor.endsWith(",")) {
        combinedInput.value = beforeCursor + keyword + "," + afterCursor;
      } else if (beforeCursor === "") {
        combinedInput.value = keyword + "," + afterCursor;
      } else {
        combinedInput.value = beforeCursor + "," + keyword + "," + afterCursor;
      }
    }

    // 키워드 개수 업데이트
    updateKeywordCount(combinedInput);

    // 내용에 맞게 높이 자동 조절
    autoResizeTextarea(combinedInput);

    // 포커스 유지 및 커서 위치 이동
    combinedInput.focus();
    const newPosition =
      cursorPosition +
      keyword.length +
      (currentText.length === 0
        ? 0
        : cursorPosition === currentText.length
        ? currentText.endsWith(", ")
          ? 0
          : currentText.endsWith(",")
          ? 1
          : 2
        : beforeCursor.endsWith(", ") || beforeCursor.endsWith(" ")
        ? 2
        : beforeCursor.endsWith(",")
        ? 3
        : beforeCursor === ""
        ? 2
        : 4);
    combinedInput.setSelectionRange(newPosition, newPosition);
  };

  return keywordElement;
}

// 키워드 개수 업데이트 함수
function updateKeywordCount(combinedInput) {
  const container = document.getElementById("scraping-results");
  const combinedSection = container.querySelector("div:first-child");
  const keywordCountElement = combinedSection.querySelector("div:last-child");

  const keywords = combinedInput.value
    .split(",")
    .map((k) => k.trim())
    .filter((k) => k.length > 0);

  keywordCountElement.textContent = `총 ${keywords.length}개의 키워드`;
}

function displayResults(
  naverKeywords,
  coupangKeywords,
  rawNaverKeywords,
  isInitialLoad = true
) {
  // 결과 컨테이너를 찾거나 생성
  let container = document.getElementById("scraping-results");
  let combinedSection,
    naverContainer,
    coupangContainer,
    combinedInput,
    copyButton;

  // 컨테이너가 없거나 초기 로드인 경우 새로 생성
  if (!container || isInitialLoad) {
    if (container) {
      container.remove();
    }
    const results = createResultsContainer();
    container = results.container;
    combinedInput = results.combinedInput;
    naverContainer = results.naverKeywords;
    coupangContainer = results.coupangKeywords;
    copyButton = results.copyButton;

    // tagResultParent 요소 안에 결과 컨테이너 추가
    const tagResultParent = document.getElementById("tagResultParent");
    if (tagResultParent) {
      tagResultParent.appendChild(container);
    }
  } else {
    // 기존 컨테이너에서 요소 찾기
    combinedSection = container.querySelector("div:first-child");
    naverContainer = container.querySelector("#naver-keywords");
    coupangContainer = container.querySelector("#coupang-keywords");
    combinedInput = container.querySelector("textarea");
    copyButton = container.querySelector("button");
  }

  // 통합 키워드 섹션 업데이트
  combinedSection = container.querySelector("div:first-child");
  if (!naverKeywords || !coupangKeywords) {
    // 둘 중 하나라도 없으면 로딩 스피너 표시 (input은 유지)
    const header = combinedSection.querySelector("div:first-child");
    const spinner = createLoadingSpinner();
    spinner.style.cssText = `
      width: 20px;
      height: 20px;
      margin-left: 8px;
      display: inline-block;
      vertical-align: middle;
    `;

    // 기존 스피너 제거
    const existingSpinner = header.querySelector(".loading-spinner");
    if (existingSpinner) {
      existingSpinner.remove();
    }

    spinner.classList.add("loading-spinner");
    header.insertBefore(spinner, copyButton);

    // input과 키워드 카운트 초기화
    combinedInput.value = "";
    const keywordCountElement = combinedSection.querySelector("div:last-child");
    keywordCountElement.textContent = "키워드 로딩 중...";
  } else {
    // 둘 다 있으면 통합 키워드 표시
    const allKeywords = [...new Set([...naverKeywords, ...coupangKeywords])];
    combinedInput.value = allKeywords.join(",");

    // 내용에 맞게 높이 자동 조절
    autoResizeTextarea(combinedInput);

    // 스피너 제거
    const spinner = combinedSection.querySelector(".loading-spinner");
    if (spinner) {
      spinner.remove();
    }

    // 키워드 갯수 업데이트
    const keywordCountElement = combinedSection.querySelector("div:last-child");
    keywordCountElement.textContent = `총 ${allKeywords.length}개의 키워드`;

    // 복사 버튼 기능
    copyButton.onclick = () => {
      navigator.clipboard.writeText(combinedInput.value);
      copyButton.textContent = "복사됨!";
      setTimeout(() => {
        copyButton.textContent = "복사하기";
      }, 2000);
    };
  }

  // 네이버 키워드 섹션 업데이트
  if (!rawNaverKeywords) {
    naverContainer.innerHTML = "";
    naverContainer.appendChild(createLoadingSpinner());
  } else {
    naverContainer.innerHTML = "";
    rawNaverKeywords.forEach((keyword) => {
      const keywordElement = createKeywordElement(keyword, combinedInput);
      naverContainer.appendChild(keywordElement);
    });
  }

  // 쿠팡 키워드 섹션 업데이트
  if (!coupangKeywords) {
    coupangContainer.innerHTML = "";
    coupangContainer.appendChild(createLoadingSpinner());
  } else {
    coupangContainer.innerHTML = "";
    coupangKeywords.forEach((keyword) => {
      const keywordElement = createKeywordElement(keyword, combinedInput);
      coupangContainer.appendChild(keywordElement);
    });
  }
}

// 메시지 리스너 수정
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "SCRAPING_RESULTS") {
    displayResults(
      message.naverKeywords,
      message.coupangKeywords,
      message.rawNaverKeywords,
      false // 업데이트 모드
    );
  }
});
