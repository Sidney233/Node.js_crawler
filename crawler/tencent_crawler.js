var source_name = "腾讯新闻";
var myEncoding = "gbk";
var seedURL = 'https://www.qq.com/';

var seedURL_format = "$('a')";
var keywords_format = " $('meta[name=\"keywords\"]').eq(0).attr(\"content\")";
var title_format = "$('title').text()";
var date_format = " $('meta[name=\"apub:time\"]').eq(0).attr(\"content\")";
var author_format = "$('#editor_baidu').text()";
var content_format = "$('.one-p').text()";
var desc_format = " $('meta[name=\"description\"]').eq(0).attr(\"content\")";
var source_format = "$('#source_baidu').text()";
var url_reg = /omn\/(\d{8})\/([A-Z0-9]{16}).html/;
var regExp = /\d{1,2}\/\d{1,2}\/\d{4}/;

var fs = require('fs');
var myRequest = require('request')
var myCheerio = require('cheerio')
var myIconv = require('iconv-lite')
var mysql = require('./mysql.js');
require('date-utils');

//防止网站屏蔽我们的爬虫
var headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/535.1 (KHTML, like Gecko) Chrome/14.0.835.163 Safari/535.1'
}

//request模块异步fetch url
function request(url, callback) {
    var options = {
        url: url,
        encoding: null,
        //proxy: 'http://x.x.x.x:8080',
        headers: headers,
        timeout: 10000 //
    }
    myRequest(options, callback)
}

request(seedURL, function(err, res, body) { //读取种子页面
    // try {
    //用iconv转换编码
    var html = myIconv.decode(body, myEncoding);
    //console.log(html);
    //准备用cheerio解析html
    var $ = myCheerio.load(html, { decodeEntities: true });
    // } catch (e) { console.log('读种子页面并转码出错：' + e) };

    var seedurl_news;

    try {
        seedurl_news = eval(seedURL_format);
        //console.log(seedurl_news);
    } catch (e) { console.log('url列表所处的html块识别出错：' + e) };

    seedurl_news.each(function(i, e) { //遍历种子页面里所有的a链接
        var myURL = "";
        try {
            //得到具体新闻url
            var href = "";
            href = $(e).attr("href");
            if (typeof(href) == "undefined") {  // 有些网页地址undefined
                return true;
            }
            if (href.toLowerCase().indexOf('http://') >= 0 || href.toLowerCase().indexOf('https://') >= 0) myURL = href; //http://开头的或者https://开头
            else if (href.startsWith('//')) myURL = 'http:' + href; ////开头的
            else myURL = seedURL.substr(0, seedURL.lastIndexOf('/') + 1) + href; //其他

        } catch (e) { console.log('识别种子页面中的新闻链接出错：' + e) }

        if (!url_reg.test(myURL)) return; //检验是否符合新闻url的正则表达式
        // console.log(myURL);
        
        var fetch_url_Sql = 'select url from fetches where url=?';
        var fetch_url_Sql_Params = [myURL];
        mysql.query(fetch_url_Sql, fetch_url_Sql_Params, function(qerr, vals, fields) {
            if (vals.length > 0) {
                console.log('URL duplicate!')
            } else newsGet(myURL); //读取新闻页面
        });
    });
});

function newsGet(myURL) { //读取新闻页面
    request(myURL, function(err, res, body) { //读取新闻页面
        //try {
        var html_news = myIconv.decode(body, myEncoding); //用iconv转换编码
        //console.log(html_news);
        //准备用cheerio解析html_news
        var $ = myCheerio.load(html_news, { decodeEntities: true });
        myhtml = html_news;
        //} catch (e) {    console.log('读新闻页面并转码出错：' + e);};

        console.log("转码读取成功:" + myURL);
        //动态执行format字符串，构建json对象准备写入文件或数据库
        var fetch = {};
        fetch.title = "";
        fetch.content = "";
        fetch.publish_date = (new Date()).toFormat("YYYY-MM-DD");
        //fetch.html = myhtml;
        fetch.url = myURL;
        fetch.source_name = source_name;
        fetch.source_encoding = myEncoding; //编码
        fetch.crawltime = new Date();

        if (keywords_format == "") fetch.keywords = source_name; // eval(keywords_format);  //没有关键词就用sourcename
        else fetch.keywords = eval(keywords_format);

        if (title_format == "") fetch.title = ""
        else fetch.title = eval(title_format); //标题

        if (date_format != "") fetch.publish_date = eval(date_format); //刊登日期   
        console.log('date: ' + fetch.publish_date);
        console.log(myURL);
        if (fetch.title == '') {
            console.log("此文章不存在");
            return;
        }
        fetch.publish_date = regExp.exec(fetch.publish_date)[0];
        fetch.publish_date = fetch.publish_date.replace('年', '-')
        fetch.publish_date = fetch.publish_date.replace('月', '-')
        fetch.publish_date = fetch.publish_date.replace('日', '')
        fetch.publish_date = new Date(fetch.publish_date).toFormat("YYYY-MM-DD");

        if (author_format == "") fetch.author = source_name; //eval(author_format);  //作者
        else fetch.author = eval(author_format);

        if (content_format == "") fetch.content = "";
        else fetch.content = eval(content_format).replace("\r\n" + fetch.author, ""); //内容,是否要去掉作者信息自行决定

        if (source_format == "") fetch.source = fetch.source_name;
        else fetch.source = eval(source_format).replace("\r\n", ""); //来源

        if (desc_format == "") fetch.desc = fetch.title;
        else fetch.desc = eval(desc_format).replace("\r\n", ""); //摘要    

        var fetchAddSql = 'INSERT INTO fetches(url,source_name,source_encoding,title,' +
            'keywords,author,publish_date,crawltime,content) VALUES(?,?,?,?,?,?,?,?,?)';
        var fetchAddSql_Params = [fetch.url, fetch.source_name, fetch.source_encoding,
            fetch.title, fetch.keywords, fetch.author, fetch.publish_date,
            fetch.crawltime.toFormat("YYYY-MM-DD HH24:MI:SS"), fetch.content
        ];

        //执行sql，数据库中fetch表里的url属性是unique的，不会把重复的url内容写入数据库
        mysql.query(fetchAddSql, fetchAddSql_Params, function(qerr, vals, fields) {
            if (qerr) {
                console.log(qerr);
            }
        }); //mysql写入
    });
}
