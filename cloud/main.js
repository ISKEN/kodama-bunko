// Models
var Copy = Parse.Object.extend("Copy", {
    // Instance methods,
 	borrow: function(memberId) {
 		var copy = this;
 		return copy.canBorrow()
	 		.then(function() {
	 			return Member.get(memberId);
	 		})
	 		.then(function(member) {
				var Transaction = Parse.Object.extend("Transaction");
				var transaction = new Transaction();
				transaction.set("effectiveDate", new Date());
				transaction.set("transactionType", "貸出");
				transaction.set("member", member);
				transaction.set("copy", copy);
				return transaction.save();
	 		});
 	},
 	canBorrow: function() {
 		return this.getStatus()
 			.then(function(status) {
				if (status == "未在庫" || status == "在庫中") { 
					return true;
				}
				return Parse.Promise.error("貸出できません。");
 			});
    },
    return: function(placeId) {
    	var copy = this;
    	return copy.canReturn()
    		.then(function() {
    			return Place.get(placeId);
    		})
    		.then(function(place) {
				var Transaction = Parse.Object.extend("Transaction");
				var transaction = new Transaction();
				transaction.set("effectiveDate", new Date());
				transaction.set("transactionType", "返却");
				transaction.set("place", place);
				transaction.set("copy", copy);
				return transaction.save();
    		});
    },
    canReturn: function() {
    	return this.getStatus()
	    	.then(function(status) {
	    		if (status == "貸出中") {
	    			return true;
	    		}
				return Parse.Promise.error("返却できません。");
	    	});
    },
    move: function(placeId) {
    	var copy = this;
    	return copy.canMove()
    		.then(function() {
    			return Place.get(placeId);
    		})
    		.then(function(place) {
				var Transaction = Parse.Object.extend("Transaction");
				var transaction = new Transaction();
				transaction.set("effectiveDate", new Date());
				transaction.set("transactionType", "移動");
				transaction.set("place", place);
				transaction.set("copy", copy);
				return transaction.save();
    		});
    },
    canMove: function() {
    	return this.getStatus()
	    	.then(function(status) {
	    		if (status == "未在庫" || status == "在庫中") {
	    			return true;
	    		}
				return Parse.Promise.error("移動できません。");
	    	});
    },
    getStatus: function() {
		var Transaction = Parse.Object.extend("Transaction");
		var query = new Parse.Query(Transaction);
	   	query.equalTo("copy", this);
    	query.limit(1);
		query.descending("effectiveDate");
 		return query.first()
 			.then(function(transaction) {
 				var type = transaction == null 
 						? "" : transaction.get("transactionType");
 				return Copy.toStatus(type);
 			});
    }
}, {
	// Class properties
 	get: function(copyId) {
		var Copy = Parse.Object.extend("Copy");
		var query = new Parse.Query(Copy);
		return query.get(copyId);
 	},
 	toStatus: function(type) {
 		if (type == "") { return "未在庫"; }
 		if (type == "貸出") { return "貸出中"; }
 		if (type == "移動" || type == "返却") { return "在庫中"; }
 		if (type == "削除" ) { return "削除済"; }
 		return Parse.Promise.error("想定されていない種別です。");
 	}
});
var Member = Parse.Object.extend("Member", {
    // Instance methods,
}, {
	// Class properties
 	get: function(memberId) {
		var Member = Parse.Object.extend("Member");
		var query = new Parse.Query(Member);
		return query.get(memberId);
 	}
});
var Place = Parse.Object.extend("Place", {
    // Instance methods,
}, {
	// Class properties
 	get: function(placeId) {
		var Place = Parse.Object.extend("Place");
		var query = new Parse.Query(Place);
		return query.get(placeId);
 	}
});


/**
 * 貸出の記録
 * @param {string} copyId - Copy.objectId
 * @param {string} memberId - Member.objectId
 */
Parse.Cloud.define("borrow", function(request, response) {
	var copyId = request.params.copyId;
	var memberId = request.params.memberId;
	Copy.get(copyId)
		.then(function(copy){
			return copy.borrow(memberId);
		})
		.then(function(transaction) {
			response.success("貸出OK");				
		}, function(error) {
			response.error(error);
		});
});

/**
 * 入庫の記録（返却、移動）
 * @param {string} copyId - Copy.objectId
 * @param {string} locationId - Location.objectId
 */
Parse.Cloud.define("putin", function(request, response) {
	var copyId = request.params.copyId;
	var placeId = request.params.placeId;
	Copy.get(copyId)
		.then(function(copy) {
			return copy.getStatus();
		})
		.then(function(status) {
			if (status == "貸出中") {
				// 再検索するのが気持ち悪い
				return Copy.get(copyId)
				.then(function(copy) {
					return copy.return(placeId);
				});
			}
			// それ以外の場合は移動
			return Copy.get(copyId)
			.then(function(copy) {
				return copy.move(placeId);
			});
		})
		.then(function(transaction) {
			response.success(transaction.get("transactionType") + "OK");
		}, function(error) {
			response.error(error);
		});
});

/**
 * 蔵書の取得
 * @param {string} itemNo
 */
Parse.Cloud.define("getCopy", function(request, response) {
	var Copy = Parse.Object.extend("Copy");
	var query = new Parse.Query(Copy);
	query.equalTo("bookNo", request.params.bookNo);
	return query.find({
		success: function(results){
			if(results.length == 0) {
				response.error("蔵書が登録されていません。");
			} else {
				response.success(results[0]);
			}
		},
		error: function(error) {
			response.error(error);
		}
	});
});

/**
 * 蔵書の検索
 * @param {string} keyword
 */
Parse.Cloud.define("findCopy", function(request, response) {
	var query = new Parse.Query(Copy);
	var keywords = request.params.keywords;
	var regex;
	if (keywords.length == 0) {
		response.error("検索条件を指定してください。");
	} else if (keywords.length == 1) {
		regex = ".*" + keywords[0] + ".*";
	} else {
		regex = "^";
		for (var i = 0; i < keywords.length; i++) {
			if (keywords[i] == "") continue;
			regex += "(?=.*" + keywords[i] + ")";
		};
		regex += ".*"
	}
	console.log(regex);
	query.matches("attributes", regex);
	var Transaction = Parse.Object.extend("Transaction");
	var promises = [];
	query.find()
	.then(function(copies) {
		copies = copies;
	    for(var i = 0; i < copies.length; i++) {
	        var copy = copies[i];
	        var tquery = new Parse.Query(Transaction);
	        tquery.equalTo("copy", copy);
			tquery.descending("effectiveDate");
			tquery.include("member");
			tquery.include("place");
	        promises.push(tquery.first());
	    }
	  	Parse.Promise.when(promises)
		.then(function() {
			// Tranasctionの検索結果を、CopyのIDをキーにしたMapにする
			var map = {};
			for(var j = 0; j < arguments.length; j++) {
				var t = arguments[j];
				if (t != null) {
					var copy = t.get("copy");
					console.log(t.get("member"));
					map[copy.id] = t;
				}
			}
			// 検索されたCopyをもとに、レスポンスで返す結果を作成する
			var results = [];
		    for(var k = 0; k < copies.length; k++) {
		    	var copy = copies[k];
		    	var transaction = map[copy.id];
		    	var jsonCopy = copy.toJSON();
		    	if (transaction != null) {
		    		var member = transaction.get("member");
		    		var place = transaction.get("place");
		    		if (member != null) {
		    			jsonCopy["member"] = member.toJSON();
		    		}
		    		if (place != null) {
		    			jsonCopy["place"] = place.toJSON();
		    		}
		    	}
		    	results.push(jsonCopy);
		    }
			response.success(results);
		}, function(error) {
			response.error(error);	
		});
	})
});

/**
 * 場所の検索
 * @param {string} placeNo - Place.placeNo
 */
Parse.Cloud.define("getPlace", function(request, response) {
	var placeNo = request.params.placeNo;
	var Place = Parse.Object.extend("Place");
	var query = new Parse.Query(Place);
	query.equalTo("placeNo", placeNo);
	query.find({
		success: function(results) {
			if (results.length == 0) {
				response.error("保管場所が登録されていません。");
			} else {
				response.success(results[0]);
			}
	  	},
		error: function(error) {
			response.error(error);
		}
	});
});

/**
 * 会員の検索
 * @param {string} memberNo - Member.memberNo
 */
Parse.Cloud.define("getMember", function(request, response) {
	var memberNo = request.params.memberNo;
	var Member = Parse.Object.extend("Member");
	var query = new Parse.Query(Member);
	query.equalTo("memberNo", memberNo);
	query.find({
		success: function(results) {
			// 登録されていなければエラー
			if (results.length == 0) {
				response.error("会員が登録されていません。");
			} else {
				response.success(results[0]);
			}
	  	},
		error: function(error) {
			response.error(error);
		}
	});
});


/**
 * 蔵書の登録
 * @param {string} bookNo - 
 */
Parse.Cloud.define("addCopy", function(request, response) {
	var bookNo = request.params.bookNo;
	var _num;
	var Copy = Parse.Object.extend("Copy");
	var query = new Parse.Query(Copy);
	query.equalTo("bookNo", bookNo);
	query.find()
		.then(function(results) {
			if(results.length > 0) {
				return Parse.Promise.error("既に蔵書が登録されています。");
			}
			return getGoogleBookInfo(bookNo);
		})	
		.then(function(httpResponse) {
			return JSON.parse(httpResponse.text);
		})
		.then(function(_response) {
			if (_response.totalItems == 0) {
				// なかった場合は国会図書館のAPIを使う
				// XXX 後で実装する
				return Parse.Promise.error("GoogleAPIで検索できませんでした。");
			} else {
				// 見つかった場合
				for (var i = 0; i < _response.items.length; i++) {
					var res_item = _response.items[i];
					for (var j = 0; j < res_item.volumeInfo.industryIdentifiers.length; j++) {
						var industryIdentifier = res_item.volumeInfo.industryIdentifiers[j];
						if (industryIdentifier.identifier == bookNo) {
							return parseAttributes(res_item);
						}
					}
				}
			}
		})
		.then(function(attributes){
			var copy = new Copy();
			copy.set("bookNo", bookNo);
			copy.set("attributes", JSON.stringify(attributes));
			return copy.save();
		})	
		.then(function(result) {
			response.success("OK!");
		}, function(error) {
			response.error(error);
		});
});


getGoogleBookInfo = function(isbn) {
	var address = "https://www.googleapis.com/books/v1/volumes?q=isbn:" + isbn;
	return Parse.Cloud.httpRequest({
		url : address
	})
};

getAmazonBookInfo = function(isbn) {
	var jsSHA = require('cloud/sha256.js');
	var url = "http://ecs.amazonaws.jp/onca/xml?";
	var para = {
		Service:"AWSECommerceService",
		Version:"2011-08-01",
		Operation:"ItemLookup",
		SearchIndex:"Books",
		AssociateTag : "KodamaBunko555",
		ItemId: isbn,
		Timestamp:new Date().toISOString(),
		AWSAccessKeyId:"", // AWSに怒られたので、一旦消す。。
		IdType:"ISBN",
		ResponseGroup:"ItemAttributes"
	};
	var para_array = [];
	for(var pname in para){
		para_array.push(pname + "=" + encodeURIComponent(para[pname]));
	}
	para_array.sort();
	var str_para = para_array.join('&');
	var str_signature = "GET" + "\n" + "ecs.amazonaws.jp" + "\n" + "/onca/xml" + "\n" + str_para;
	var shaObj = new jsSHA("SHA-256", "TEXT");
	shaObj.setHMACKey("oQYufranEHIyKuTC4MyXzuciwKyppr6rkSiPFo7N", "TEXT");
	shaObj.update(str_signature);
	var signature = shaObj.getHMAC("B64");
	var z = url + str_para + "&Signature=" + signature;

	return Parse.Cloud.httpRequest({ url: z });
};

parseAttributes = function(attributes) {
	var _attributes = {};
    _attributes.asin = attributes.volumeInfo.industryIdentifiers[0].identifier;
    _attributes.authors = attributes.volumeInfo.authors;
    _attributes.category =  "なし";
    _attributes.description =  attributes.volumeInfo.description;
    _attributes.genre =  "なし";
    _attributes.infoLink =  attributes.volumeInfo.infoLink; 
    _attributes.isbn =  attributes.volumeInfo.industryIdentifiers[1].identifier;
    _attributes.price =  "なし";
    _attributes.publishedDate =  attributes.volumeInfo.publishedDate; 
    _attributes.publisher =  "なし"; 
    _attributes.rank =  "なし";
    _attributes.smallThumbnail =  attributes.volumeInfo.smallThumbnail;
    _attributes.thumbnail =  attributes.volumeInfo.thumbnail;
    _attributes.title =  attributes.volumeInfo.title;
	return _attributes;
};
