import AsyncStorage from "@react-native-async-storage/async-storage";
import { REMOTE_FLAGS_URL } from "@/config/features";
import { FEATURE_FLAGS_KEY, fetchRemoteFlags, loadStoredFlags, saveStoredFlags } from "./remoteFeatureFlags";

function fakeFetch(body: string, status = 200) {
  return jest.fn(async () => new Response(body, { status })) as unknown as jest.MockedFunction<typeof fetch>;
}

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe("fetchRemoteFlags（對應 docs/stories/026）", () => {
  test("抓 GitHub 上的 JSON，略過手機端快取，只回認得的開關", async () => {
    const fetchImpl = fakeFetch('{"aiInsight":true,"proPlan":"yes","hack":true}');
    expect(await fetchRemoteFlags(fetchImpl)).toEqual({ aiInsight: true });
    expect(fetchImpl).toHaveBeenCalledWith(REMOTE_FLAGS_URL, expect.objectContaining({ cache: "no-store" }));
  });

  test("HTTP 404（分支或檔案還沒建立）：回 null", async () => {
    expect(await fetchRemoteFlags(fakeFetch("404: Not Found", 404))).toBeNull();
  });

  test("不是 JSON 或整份不是物件：回 null", async () => {
    expect(await fetchRemoteFlags(fakeFetch("<html>"))).toBeNull();
    expect(await fetchRemoteFlags(fakeFetch("[true]"))).toBeNull();
  });

  test("網路錯誤：回 null，不丟錯", async () => {
    const fetchImpl = jest.fn(async () => {
      throw new TypeError("Network request failed");
    }) as unknown as typeof fetch;
    expect(await fetchRemoteFlags(fetchImpl)).toBeNull();
  });

  test("太久沒回應：5 秒後放棄並回 null", async () => {
    jest.useFakeTimers();
    try {
      const fetchImpl = jest.fn(
        (_url: string, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) =>
            init?.signal?.addEventListener("abort", () => reject(new Error("aborted"))),
          ),
      ) as unknown as typeof fetch;
      const result = fetchRemoteFlags(fetchImpl);
      jest.advanceTimersByTime(5000);
      expect(await result).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("手機裡存的遠端開關", () => {
  test("存了再讀回來", async () => {
    await saveStoredFlags({ proPlan: true });
    expect(await loadStoredFlags()).toEqual({ proPlan: true });
  });

  test("沒存過：null", async () => {
    expect(await loadStoredFlags()).toBeNull();
  });

  test("內容壞掉：null；不認得的欄位忽略", async () => {
    await AsyncStorage.setItem(FEATURE_FLAGS_KEY, "{oops");
    expect(await loadStoredFlags()).toBeNull();
    await AsyncStorage.setItem(FEATURE_FLAGS_KEY, '{"aiInsight":true,"x":1}');
    expect(await loadStoredFlags()).toEqual({ aiInsight: true });
  });
});
