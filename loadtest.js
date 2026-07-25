import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  vus: 100,          // 50 virtual users
  duration: "60s",  // Run for 30 seconds
};

export default function () {
  const res = http.get("https://www.eadronix.com/");

  check(res, {
    "status is 200": (r) => r.status === 200,
  });

  sleep(1);
}