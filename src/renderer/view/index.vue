<template>
  <div id="wrapper">
    <img id="logo" src="~@/assets/logo.png" alt="electron-vue">
    <div class="doc">
      <div class="title">Getting Started</div>
      <input @change="uploadfile($event)" type="file" value="上传文件" />
      <button @click="calc">开始计算</button>
      <button @click="action">{{isShowResult ? '收起数据' : '展开数据'}}</button>
      <button @click="clear">清除数据</button>
      <br><br>
      <input v-model="companyId" type="text" placeholder="请输入公司">
      <input v-model="year" type="text" placeholder="请输入年份">
      <span class="tips">*检索前请先计算</span>
      <br><br/>
      <button @click="search">开始检索</button>
      <button @click="download">下载excel</button>
      <span v-if="result">检索结果:{{result}}</span>
      <br><br>
      <ul>
        <li>
          <span>公司ID </span>
          <span>年份</span>          
          <span class="center">K4_average</span>
          <span class="center">Median </span>
          <span class="center">average</span>
        </li>
      </ul>
      <ul v-show="isShowResult" v-for="(items, k1) in Array.from(dataMap)" :key="k1">
        <li v-for="(item, k2) in Array.from(items[1])" :key="k2">
          <span>{{items[0]}}</span>
          <span>{{item[0]}}</span>
          <span>{{item[1].k4_average}}</span>
          <span>{{item[1].median}}</span>
          <span>{{item[1].average}}</span>
        </li>
      </ul>
    </div>
  </div>
</template>

<script>
import fs from "fs";
import path from "path";
const ml = require("ml-regression");
const csv = require("csvtojson");
const Json2csvParser = require("json2csv").Parser;
const { dialog } = require("electron");
export default {
  name: "landing-page",
  components: {},
  data() {
    return {
      isShowResult: true,
      dataMap: new Map(),
      companyId: null,
      year: null,
      result: null,
      file: {}
    };
  },
  methods: {
    action() {
      this.isShowResult = !this.isShowResult;
    },
    clear() {
      this.dataMap = new Map();
    },
    search() {
      if (this.dataMap.size <= 0) {
        alert("还没有开始计算，没有数据可供查询，请先计算...");
        return false;
      }
      if (this.companyId == null) {
        alert("请输入公司...");
        return false;
      }
      if (this.year == null) {
        alert("请输入年份...");
        return false;
      }
      const companyId = this.companyId.toString();
      const year = Number(this.year);
      if (!this.dataMap.has(companyId)) {
        alert(`没有公司${companyId}的数据`);
        return false;
      }
      if (!this.dataMap.get(companyId).has(year)) {
        alert(`没有公司${companyId}在${year}年的数据，请查询其它年份`);
        return false;
      }
      this.result = this.dataMap.get(companyId).get(year);
    },
    uploadfile(event) {
      console.log(event.target.files[0]);
      this.file = event.target.files[0];
      event.target.value = null;
    },
    download() {
      if (this.dataMap.size > 0) {
        const fields = ["companyId", "year", "k4_average", "median", "average"];
        const transformData = [];
        for (let [companyId, value] of this.dataMap) {
          for (let [year, v2] of value) {
            const tmpData = {
              companyId,
              year,
              k4_average: v2.k4_average,
              median: v2.median,
              average: v2.average
            };
            transformData.push(tmpData);
          }
        }
        const json2csvParser = new Json2csvParser({ fields });
        const csv = json2csvParser.parse(transformData);
        console.log(csv);
        const out = fs.createWriteStream(
          path.join(__static, "calc/result.csv"),
          {
            encoding: "utf8"
          }
        );
        out.write(csv);
        out.end();
      } else {
        alert("请先计算结果!");
      }
    },
    calc() {
      const _this = this;
      const SLR = ml.SLR; // Simple Linear Regression
      const companyDataMap = new Map(); // 将数据按照公司归类
      const nindnmeMap = new Map(); // 将公司按照行业归类
      const coefficientMap = new Map(); // 每个公司,每个年份的回归系数，是个二位数组
      const relateCompanyMap = new Map(); // 每个年份的同行业公司
      let comparableMap = new Map(); // 每个年份的同行业公司
      if (this.dataMap.size > 0) return false;
      const stream = this.file.path
        ? fs.createReadStream(this.file.path)
        : fs.createReadStream(path.join(__static, "calc/data.csv"));
      csv({ delimiter: "," })
        .fromStream(stream)
        .then(jsonArray => {
          // 将数据按公司和年份分类
          for (let i = 0, len = jsonArray.length; i < len; i++) {
            const json = jsonArray[i];
            // 剔除无效数据
            if (
              !isNaN(json.earning1) &&
              !isNaN(json.returnSe) &&
              !isNaN(json.year)
            ) {
              if (
                json.earning1 != 0 &&
                json.earning1 != "" &&
                json.returnSe != 0 &&
                json.returnSe != "" &&
                json.year != 0 &&
                json.year != "" &&
                json.Nindnme != 0 &&
                json.Nindnme != ""
              ) {
                json.returnSe = f(json.returnSe);
                json.earning1 = f(json.earning1);
                json.year = Number(json.year);
                if (companyDataMap.has(json.id)) {
                  // 假设数据不会重复
                  if (companyDataMap.get(json.id).has(json.year)) {
                    companyDataMap
                      .get(json.id)
                      .get(json.year)
                      .data.push(json);
                  } else {
                    companyDataMap
                      .get(json.id)
                      .set(json.year, { nindnme: json.Nindnme, data: [json] });
                  }
                } else {
                  // 初始化
                  companyDataMap.set(
                    json.id,
                    new Map([
                      [json.year, { nindnme: json.Nindnme, data: [json] }]
                    ])
                  );
                }
              }
            }
          }
          // check 是否中途变更行业
          let count = 0;
          for (let [key, value] of companyDataMap) {
            let temp = new Set();
            for (let v of value.values()) {
              if (!temp.has(v.nindnme)) {
                temp.add(v.nindnme);
              }
            }
            if (temp.size > 1) {
              count++;
            }
          }
          console.log(`剔除无效数据后仍然多达${count}家`);
          // 先计算出所有公司所有年份的回归系数
          for (let [companyId, yearMap] of companyDataMap) {
            const x = [];
            const y = [];
            // 循环判断可以计算回归系数的年份
            for (let year of yearMap.keys()) {
              // 计算此年份的前16个月是否存在，存在则可以计算系数
              let season = 0;
              for (let i = 0; i < 4; i++) {
                if (yearMap.has(year - i)) {
                  if (
                    yearMap.get(year - i).nindnme == yearMap.get(year).nindnme
                  ) {
                    season += yearMap.get(year - i).data.length;
                  }
                }
              }
              if (season < 16) continue;
              for (let i = 0; i < 4; i++) {
                for (
                  let j = 0, len = yearMap.get(year - i).data.length;
                  j < len;
                  j++
                ) {
                  const row = yearMap.get(year - i).data[j];
                  x.push(row.returnSe);
                  y.push(row.earning1);
                }
              }
              const coefficient = performRegression(x, y);
              if (coefficientMap.has(companyId)) {
                coefficientMap
                  .get(companyId)
                  .set(year, coefficient.concat([yearMap.get(year).nindnme]));
              } else {
                coefficientMap.set(
                  companyId,
                  new Map([
                    [year, coefficient.concat([yearMap.get(year).nindnme])]
                  ])
                );
              }
            }
          }
          console.log("仍然有多少家公司可以求值：" + coefficientMap.size);
          // 计算每个年份的同行业公司
          for (let [companyId, yearMap] of coefficientMap) {
            for (let [year, coefficient] of yearMap) {
              if (relateCompanyMap.has(year)) {
                if (relateCompanyMap.get(year).has(coefficient[2])) {
                  relateCompanyMap
                    .get(year)
                    .get(coefficient[2])
                    .push(companyId);
                } else {
                  relateCompanyMap.get(year).set(coefficient[2], [companyId]);
                }
              } else {
                relateCompanyMap.set(
                  year,
                  new Map([[coefficient[2], [companyId]]])
                );
              }
            }
          }
          for (let [year, nindnmeMap] of relateCompanyMap) {
            for (let [nindnme, data] of nindnmeMap) {
              if (data.length < 2) {
                console.log(`${year}年${nindnme}行业只有一个公司: ${data[0]}`);
              }
            }
          }
          // 开始计算各公司各年度的会计可比性
          comparableMap = new Map();
          for (let [companyId, yearMap] of coefficientMap) {
            for (let [year, coefficient] of yearMap) {
              // console.log(`开始计算公司${companyId} ${year}年的会计可比性:`);
              // 获取公司这一年前16个季度的数据
              const _thisNindnme = coefficient[2];
              const _seasonData = get16seasonData(companyId, year);
              const _thisEarnig = calculateEarning(_seasonData, coefficient);
              const _relateCompany = relateCompanyMap
                .get(year)
                .get(_thisNindnme);
              if (_relateCompany.length > 1) {
                const _earningArray = [];
                for (let i = 0, len = _relateCompany.length; i < len; i++) {
                  if (_relateCompany[i] == companyId) continue;
                  const _relateCompanyCoefficient = coefficientMap
                    .get(_relateCompany[i])
                    .get(year);
                  const _earning = calculateEarning(
                    _seasonData,
                    _relateCompanyCoefficient
                  );
                  _earningArray.push(absoluteDistance(_earning, _thisEarnig));
                }
                const _k4_average = k4_average(_earningArray);
                const _median = median(_earningArray);
                const _average = average(_earningArray);
                if (comparableMap.has(companyId)) {
                  comparableMap.get(companyId).set(year, {
                    k4_average: _k4_average,
                    median: _median,
                    average: _average
                  });
                } else {
                  comparableMap.set(
                    companyId,
                    new Map([
                      [
                        year,
                        {
                          k4_average: _k4_average,
                          median: _median,
                          average: _average
                        }
                      ]
                    ])
                  );
                }
                _this.dataMap = comparableMap;
                console.log(
                  `公司${companyId} ${year}年的会计可比性:${_k4_average}`
                );
              } else {
                console.log(
                  `${year}年${_thisNindnme}行业不超过两家公司: ${_relateCompany}, 不具备行业可比性`
                );
              }
            }
          }
          // calculating end. test
          console.log(_this.dataMap.get("2").get(2010));
        });
      function performRegression(x, y) {
        const regressionModel = new SLR(x, y); // Train the model on training data
        // console.log(regressionModel.coefficients[1])
        return regressionModel.coefficients;
      }

      function get16seasonData(id, year) {
        let seasonData = [];
        for (let i = 0; i < 4; i++) {
          seasonData = seasonData.concat(
            companyDataMap.get(id).get(year - i).data
          );
        }
        return seasonData;
      }

      // data: 公司数据 id: 需要计算的公司ID
      function calculateEarning(data, coefficient) {
        const earning = [];
        const intercept = coefficient[0]; // y = slope * x + intercept;
        const slope = coefficient[1];
        for (let i = 0, len = data.length; i < len; i++) {
          const _earning = data[i].returnSe * slope + intercept;
          earning.push(_earning);
        }
        return earning;
      }

      function absoluteDistance(arr1, arr2) {
        let sum = 0;
        if (arr1.length != arr2.length) {
          console.log("compare error...");
          throw new Error("data length error");
        }
        for (let i = 0, len = arr1.length; i < len; i++) {
          sum += Math.abs(arr1[i] - arr2[i]);
        }
        // if (arr1.length != 16) { console.log('warn: length is short') }
        return -1 / arr1.length * sum;
      }

      function f(s) {
        return parseFloat(s);
      }

      function average(values) {
        let sum = values.reduce((previous, current) => (current += previous));
        let avg = sum / values.length;
        // console.log(avg);
        return avg;
      }

      function median(values) {
        values.sort((a, b) => a - b);
        let median =
          (values[(values.length - 1) >> 1] + values[values.length >> 1]) / 2;
        // console.log(median);
        return median;
      }

      function k4_average(values) {
        values.sort((a, b) => b - a);
        const k4_average = average(values.slice(0, 4));
        return k4_average;
      }
    }
  }
};
</script>

<style>
@import url("https://fonts.googleapis.com/css?family=Source+Sans+Pro");

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: "Source Sans Pro", sans-serif;
}

#wrapper {
  background: radial-gradient(
    ellipse at top left,
    rgba(255, 255, 255, 1) 40%,
    rgba(229, 229, 229, 0.9) 100%
  );
  min-height: 100vh;
  padding: 60px 80px;
  width: 100vw;
}

#logo {
  height: auto;
  margin-bottom: 20px;
  width: 420px;
}

.welcome {
  color: #555;
  font-size: 23px;
  margin-bottom: 10px;
}

.title {
  color: #2c3e50;
  font-size: 20px;
  font-weight: bold;
  margin-bottom: 6px;
}

.title.alt {
  font-size: 18px;
  margin-bottom: 10px;
}

.doc p {
  color: black;
  margin-bottom: 10px;
}
.doc .tips {
  color: red;
}
.doc input {
  font-size: 0.8em;
  width: 10em;
  padding: 0.75em 2em;
  margin-right: 2em;
  border: 1px solid #4fc08d;
  border-radius: 2em;
  box-sizing: border-box;
}
.doc button {
  font-size: 0.8em;
  cursor: pointer;
  outline: none;
  padding: 0.75em 2em;
  border-radius: 2em;
  display: inline-block;
  color: #fff;
  background-color: #4fc08d;
  transition: all 0.15s ease;
  box-sizing: border-box;
  border: 1px solid #4fc08d;
}

.doc button.alt {
  color: #42b983;
  background-color: transparent;
}

li > span {
  display: inline-block;
  width: 20vh;
  min-width: 180px;
  text-align: left;
}
.center {
  text-align: center;
}
</style>
