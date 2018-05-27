const fs = require('fs');
const path = require('path');
const ml = require("ml-regression");
const csv = require("csvtojson");
const SLR = ml.SLR; // Simple Linear Regression
const companyDataMap = new Map(); // 将数据按照公司归类
const nindnmeMap = new Map(); // 将公司按照行业归类
const coefficientMap = new Map(); // 每个公司,每个年份的回归系数，是个二位数组
const relateCompanyMap = new Map(); // 每个年份的同行业公司
const comparableMap = new Map(); // 每个年份的同行业公司
const SCALE = 1; // 最后数值的缩放比例，取倒数
csv({ delimiter: "," })
    .fromStream(fs.createReadStream(path.join('data.csv')))
    .then(jsonArray => {
        // 将数据按公司和年份分类
        for (let i = 0, len = jsonArray.length; i < len; i++) {
            const json = jsonArray[i];
            // 剔除无效数据
            if (!isNaN(json.earning1) && !isNaN(json.returnSe) && !isNaN(json.year)) {
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
                    json.earning1 = f(json.earning1) / SCALE;
                    json.year = f(json.year);
                    if (companyDataMap.has(json.id)) {
                        // 假设数据不会重复
                        if(companyDataMap.get(json.id).has(json.year)) {
                            companyDataMap.get(json.id).get(json.year).data.push(json);
                        } else {
                            companyDataMap.get(json.id).set(json.year, {nindnme: json.Nindnme, data: [json]});
                        }
                    } else {
                        // 初始化
                        companyDataMap.set(json.id, new Map([
                            [json.year,  {nindnme: json.Nindnme, data: [json]}]
                        ]));
                    }
                }
            }
        }
        // console.log(companyDataMap.get('2'));
        // return false;
        // check 是否中途变更行业
        let count = 0;
        for (let [key, value] of companyDataMap) {
            let temp = new Set();
            for(let v of value.values()) {
                if(!temp.has(v.nindnme)) {
                    temp.add(v.nindnme)
                }
            }
            if(temp.size > 1) {
                count ++;
            }
        }
        console.log(`剔除无效数据后仍然多达${count}家中途变更行业`);
        // return false;
        // 先计算出所有公司所有年份的回归系数
        for (let [companyId, yearMap] of companyDataMap) {
            const x = [];
            const y = [];
            // 循环判断可以计算回归系数的年份
            for (let year  of yearMap.keys()) {
                // 计算此年份的前16个月是否存在，存在则可以计算系数
                let season = 0;
                for(let i = 0; i < 4; i++) {
                    if(yearMap.has(year - i)) {
                        if(yearMap.get(year - i).nindnme == yearMap.get(year).nindnme) {
                            season += yearMap.get(year - i).data.length;
                        }
                    }
                }
                if(season < 16) continue;
                for(let i = 0; i < 4; i++) {
                    for (let j = 0, len = yearMap.get(year - i).data.length; j < len; j++) {
                        const row = yearMap.get(year - i).data[j];
                        x.push(row.returnSe);
                        y.push(row.earning1);
                    }
                }
                const coefficient = performRegression(x, y);
                if(coefficientMap.has(companyId)) {
                    coefficientMap.get(companyId).set(year, coefficient.concat([yearMap.get(year).nindnme]));
                } else {
                    coefficientMap.set(companyId, new Map([
                        [year, coefficient.concat([yearMap.get(year).nindnme])]
                    ]));
                }
            }
        }
        // console.log(coefficientMap.get('8'));
        // return false;
        console.log("仍然有多少家公司可以求值：" + coefficientMap.size);
        // 计算每个年份的同行业公司
        for (let [companyId, yearMap] of coefficientMap) {
            for (let [year, coefficient] of yearMap) {
                if(relateCompanyMap.has(year)) {
                    if(relateCompanyMap.get(year).has(coefficient[2])) {
                        relateCompanyMap.get(year).get(coefficient[2]).push(companyId);
                    } else {
                        relateCompanyMap.get(year).set(coefficient[2], [companyId]);
                    }
                } else {
                    relateCompanyMap.set(year, new Map([
                        [coefficient[2], [companyId]]
                    ]))
                }
            }
        }
        for(let [year, nindnmeMap] of relateCompanyMap) {
            for(let [nindnme, data] of nindnmeMap) {
                if(data.length < 2) {
                    console.log(`${year}年${nindnme}行业只有一个公司: ${data[0]}`);
                }
            }
        }
        // return false;
        // 开始计算各公司各年度的会计可比性
        for (let [companyId, yearMap] of coefficientMap) {
            for (let [year, coefficient] of yearMap) {
                // console.log(`开始计算公司${companyId} ${year}年的会计可比性:`);
                // 获取公司这一年前16个季度的数据
                const _thisNindnme = coefficient[2];
                const _seasonData = get16seasonData(companyId, year);
                const _thisEarnig = calculateEarning(_seasonData, coefficient);
                const _relateCompany = relateCompanyMap.get(year).get(_thisNindnme);
                if(_relateCompany.length > 1) {
                    const _earningArray = []
                    for (let i = 0, len = _relateCompany.length; i < len; i++) {
                        if (_relateCompany[i] == companyId) continue;
                        const _relateCompanyCoefficient = coefficientMap.get(_relateCompany[i]).get(year);
                        const _earning = calculateEarning(_seasonData, _relateCompanyCoefficient);
                        _earningArray.push(absoluteDistance(_earning, _thisEarnig));
                    }
                    const _k4_average = k4_average(_earningArray);
                    const _median = median(_earningArray);
                    const _average = average(_earningArray);
                    if(comparableMap.has(companyId)) {
                        comparableMap.get(companyId).set(year, {
                            k4_average: _k4_average,
                            median: _median,
                            average: _average
                        })
                    } else {
                        comparableMap.set(companyId, new Map([
                            [year, {
                                k4_average: _k4_average,
                                median: _median,
                                average: _average
                            }]
                        ]));
                    }
                    console.log(`公司${companyId} ${year}年的会计可比性:`);
                    console.log(`k4_average: ${_k4_average}`);
                    console.log(`median: ${_median}`);
                    console.log(`average: ${_average}`);
                } else {
                    console.log(`${year}年${_thisNindnme}行业不超过两家公司: ${_relateCompany}, 不具备行业可比性`);
                }
            }
        }
    });

function performRegression(x, y) {
    const regressionModel = new SLR(x, y); // Train the model on training data
    // console.log(regressionModel.coefficients[1])
    return regressionModel.coefficients;
}

function get16seasonData(id, year) {
    let seasonData = [];
    for (let i = 0; i < 4; i++) {
        seasonData = seasonData.concat(companyDataMap.get(id).get(year - i).data);
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