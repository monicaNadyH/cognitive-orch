$(document).ready(function() {


  $('.question').on('click', '.plus-icon', function(){
     $(this).closest('.section').find('.answer').slideDown();
     $(this).closest('.question').find('.column-4').addClass('blue-border');
     $(this).closest('.question').find('.icon').addClass('minus-icon').removeClass('plus-icon');
  });

  $('.question').on('click', '.minus-icon', function(){
   $(this).closest('.section').find('.answer').slideUp();
   $(this).closest('.question').find('.column-4').removeClass('blue-border');
   $(this).closest('.question').find('.icon').addClass('plus-icon').removeClass('minus-icon');

});



});
