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
 		return query.find()
 			.then(function(transactions) {
 				if (transactions.length == 0) {
 					return Parse.Promise.error("保有移動が登録されていません。");
 				}
 				var query2 = new Parse.Query(Transaction);
 				return query2.get(transactions[0].id);
 			})
 			.then(function(transaction) {
 				return Copy.toStatus(transaction.get("transactionType"));
 			});
 	},
    add: function(bookNo, attributes) {
    	console.log("ここまで4");
    	var Copy = Parse.Object.extend("Copy");
		var _copy = new Copy();
		_copy.set("bookNo", bookNo);
		_copy.set("attributes", attributes);
		_copy.save();
	}, 
	// Class properties
 	get: function(copyId) {
		var Copy = Parse.Object.extend("Copy");
		var query = new Parse.Query(Copy);
		return query.get(copyId);
 	},
 	// Class properties
 	getByBookNo: function(bookNo) {
 		console.log("Call getByBookNo");
 		console.log("bookNo is "+ bookNo);
		var Copy = Parse.Object.extend("Copy");
		var query = new Parse.Query(Copy);
		query.equalTo("bookNo", bookNo);
		
		return query.find({
		success: function(results){
			if(results.length == 0) {
				console.log("getBookNo is none");
				response.error("蔵書が登録されていません。");
			} else {
				console.log("getBookNo is succuse");
				response.success(results[0]);
			}
		},
		error: function(error) {
			console.log("getBookNo is error");
			response.error(error);
		}
	});
		
 	},
 	toStatus: function(type) {
 		if (type == "登録") { return "未在庫"; }
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
 * 保有の登録
 * @param {string} itemNo - Item.itemNo
 * @param {string} locationId - Location.objectId
 */
Parse.Cloud.define("addHolding", function(request, response) {
	var itemNo = request.params.itemNo;
	var locationId = request.params.locationId;
	// 書籍を検索する
	var Item = Parse.Object.extend("Item");
	var query = new Parse.Query(Item);
	query.equalTo("itemNo", itemNo);
	query.find({
		success: function(results) {
			// ---- 登録されていない場合 ---- //
			if (results.length == 0) {
 				// APIで検索する（検索してなかったものは登録しない）
 				// XXX登録しないようにするかどうするか
				getGoogleBookInfo(itemNo)
				.then(function(httpResponse) {
					var _response = JSON.parse(httpResponse.text);
					// 見つからなかった場合
					console.log("mai-log");
					console.log(httpResponse);
					if (_response.totalItems == 0) {
						// なかった場合は国会図書館のAPIを使う
						// XXX 後で実装する
						response.error("APIで検索できませんでした。");
				// 		var xmlToJSON = require('cloud/xmlToJSON.js');
				// 		console.log(xmlToJSON);
				// 		var json = new xmlToJSON().parseString(httpResponse.text);
					} else {
						// 見つかった場合
						for (var i = 0; i < _response.items.length; i++) {
							console.log(_response);
							var res_item = _response.items[i];
							for (var j = 0; j < res_item.volumeInfo.industryIdentifiers.length; j++) {
								var industryIdentifier = res_item.volumeInfo.industryIdentifiers[j];
								if (industryIdentifier.identifier == itemNo) {
									// 品目を登録する
									var item = new Item();
									item.save({ itemNo : itemNo, attributes : JSON.stringify(res_item) }, {
										success: function(object) {
											// 場所を検索する
											// 後でリファクタする
											var Location = Parse.Object.extend("Location");
											var query = new Parse.Query(Location);
											query.get(locationId, {
												success: function(object) {
													// 保有を登録する
									    			var Holding = Parse.Object.extend("Holding");
													var holding = new Holding();
													holding.save({ item : item, location : object }, {
														success: function(object) {
															response.success({ message: "登録しました。" });
														},
														error: function(model, error) {
															response.error(error);
														}
													});	    														
											  	},
												error: function(object, error) {
													response.error(error);
												}
											});

										},
										error: function(model, error) {
											response.error(error);
										}
									});
								}
							};
						};
					}
				}, function(httpResponse) {
				  // error
					console.error('Request failed with response code ' + httpResponse.status);
					response.error(httpResponse);
				});
			}
			// ---- 登録されている場合 ---- //
			if (results.length != 0) {
				// 場所を検索する
				var Location = Parse.Object.extend("Location");
				var query = new Parse.Query(Location);
				query.get(locationId, {
					success: function(object) {
		    			// 保有を登録する
		    			var Holding = Parse.Object.extend("Holding");
						var holding = new Holding();
						holding.save({ item : results[0], location : object }, {
							success: function(object) {
								response.success({ message: "登録しました。"});
							},
							error: function(model, error) {
								response.error(error);
							}
						});			
				  	},
					error: function(object, error) {
						response.error(error);
					}
				});
			}
		},
		error: function(error) {
			response.error(error);
		}
 	});
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
			response.success("入庫OK");
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
			console.log(results);
			console.log(results.length);
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
 * @param {string} memberNo - Me.memberNo
 * @param {string} memberNo - Me.memberNo
 * @param {string} memberNo - Me.memberNo
 */
Parse.Cloud.define("addCopy", function(request, response) {
	console.log("ここまで３");
	var memberNo = request.params.memberNo;
	var placeNo = request.params.placeNo;
	var bookNo = request.params.bookNo;
	
	var Copy = Parse.Object.extend("Copy");
	var query = new Parse.Query(Copy);
	
	var _copy = new Copy();
	
	query.equalTo("bookNo", bookNo);
	query.find({
		success: function(results){
			console.log("results -->" + results);
			if(results.length == 0) {
				console.log("getBookNo is none");
				var _bookInfo = getGoogleBookInfo(bookNo);
				var attribute = parseAttributes(_bookInfo);
				
				 _copy.add(bookNo,attribute);
				
				console.log("copy add done");
				response.success("OK");
				// TODO トランザクションを登録する
			} else {
				console.log("Exist Book(s).");
				response.error("既に蔵書が登録されています。");
			}
		},
		error: function(error) {
		console.log("getBookNo is error");
			response.error(error);
		}
	});
});

getGoogleBookInfo = function(isbn) {
	return Parse.Cloud.httpRequest({
		url: "https://www.googleapis.com/books/v1/volumes?q=isbn:" + isbn
	});
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
		AWSAccessKeyId:"AKIAI27S6S7W3RZN6P5Q",
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
	return "Test";
};
