import { WebDriver } from "selenium-webdriver";
import { Options } from "selenium-webdriver/chrome";
import { Builder, Browser, By, until } from "selenium-webdriver";
import { CHROME_CONSTANTS } from "./constants";
import { InitializeWebSocketServer } from "./ws/ws";

async function openMeet(driver: WebDriver) {
  const name = "Meeting bot";

  try {
    await driver.get("https://meet.google.com/ovy-susr-ezb");

    try {
      const popupButton = await driver.wait(
        until.elementLocated(By.xpath('//span[contains(text(),"Got it")]')),
        5000
      );
      await popupButton.click();
    } catch (e) {
      console.log("No 'Got it' popup");
    }

    const nameInput = await driver.wait(
      until.elementLocated(By.xpath('//input[@aria-label="Your name"]')),
      10000
    );

    await nameInput.clear();
    await nameInput.sendKeys(name);

    const micMute = await driver.wait(
      until.elementLocated(
        By.xpath("//div[@role='button' and @aria-label='Turn off microphone']")
      )
    );
    await micMute.click();

    const webOff = await driver.wait(
      until.elementLocated(
        By.xpath("//div[@role='button' and @aria-label='Turn off camera']")
      )
    );

    await webOff.click();

    const joinButton = await driver.wait(
      until.elementLocated(By.xpath('//span[contains(text(),"Ask to join")]')),
      10000
    );
    await joinButton.click();
  } catch (e) {
    console.error(" Error:", e);
  } finally {
    // await driver.quit();
  }
}

async function getDriver() {
  const options = new Options();
  CHROME_CONSTANTS.CHROME_OPTIONS.forEach((option) => {
    options.addArguments(option);
  });

  let driver = await new Builder()
    .forBrowser(Browser.CHROME)
    .setChromeOptions(options)
    .build();

  return driver;
}

async function startScreenshare(driver: WebDriver) {
  console.log("startScreenshare called");

  const mediaStreamOptions = JSON.stringify(
    CHROME_CONSTANTS.MEDIA_STREAM_OPTIONS
  );

  const response = await driver.executeScript(`
    (async () => {
      const ws = new WebSocket("ws://localhost:8000");

      let wsReady = false;

      ws.onopen = () => {
        console.log("Connected to WebSocket Server");
        wsReady = true;
      };

      ws.onerror = () => {
        console.log("Got error");
        wsReady = false;
      };

      ws.onclose = () => {
        console.log("WebSocket got closed");
        wsReady = false;
      };

      const mediaStreamOptions = ${mediaStreamOptions};

      const stream = await navigator.mediaDevices.getDisplayMedia(mediaStreamOptions);

      const audioContext = new AudioContext();
      const audioEl1 = document.querySelectorAll("audio")[0];
      const audioEl2 = document.querySelectorAll("audio")[1];
      const audioEl3 = document.querySelectorAll("audio")[2];

      const audioStream1 = audioContext.createMediaStreamSource(audioEl1.srcObject);
      const audioStream2 = audioContext.createMediaStreamSource(audioEl2.srcObject);
      const audioStream3 = audioContext.createMediaStreamSource(audioEl3.srcObject);

      const dest = audioContext.createMediaStreamDestination();
      audioStream1.connect(dest);
      audioStream2.connect(dest);
      audioStream3.connect(dest);

      const combinedStream = new MediaStream([
        ...stream.getVideoTracks(),
        ...dest.stream.getAudioTracks()
      ]);

      const mediaRecorder = new MediaRecorder(combinedStream, {
        mimeType: "video/webm; codecs=vp8,opus",
        timeSlice: 10000,
        videoBitsPerSecond: 1800000
      });

      console.log("Starting media recording...");
      mediaRecorder.start(10000);

      mediaRecorder.ondataavailable = (event) => {
        if (wsReady) {
          try {
            ws.send(event.data);
            console.log("Sent data");
          } catch (error) {
            console.error("Error sending chunks", error);
          }
        } else {
          console.error("WebSocket is not ready to send data");
        }
      };

      mediaRecorder.onstop = () => {
        stream.getTracks().forEach(track => track.stop());
        ws.close();
        console.log("Media recording stopped");
      };

      window.stopRecording = () => {
        if (mediaRecorder.state !== "inactive") {
          mediaRecorder.stop();
        }
      };
    })();
  `);

  console.log(response);
  await 1000000;
}

async function main() {
  const driver = await getDriver();
  await openMeet(driver);
  InitializeWebSocketServer(8000);
  await startScreenshare(driver);
}

main();
